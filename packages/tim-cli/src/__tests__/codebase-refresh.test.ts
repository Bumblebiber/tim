import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TimStore, ensureProjectSchema } from 'tim-store';
import { loadGraphJson, runCodebaseRefresh } from '../codebase-refresh.js';
import type { GraphifyGraph } from '../codebase-refresh-graph.js';

const sampleGraph: GraphifyGraph = {
  nodes: [
    { id: 'n1', source_file: 'packages/tim-cli/src/x.ts' },
    { id: 'n2', source_file: 'packages/tim-core/src/y.ts' },
  ],
  links: [{ source: 'n1', target: 'n2', relation: 'imports', confidence: 'EXTRACTED' }],
};

describe('tim codebase-refresh', () => {
  let dbPath: string;
  let workDir: string;

  beforeEach(async () => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tim-codebase-refresh-'));
    dbPath = path.join(workDir, 'tim.db');
    const store = new TimStore(dbPath);
    await store.createProject('P0063', { content: 'TIM' });
    await ensureProjectSchema(store, 'P0063');
    store.close();
    process.env.TIM_DB_PATH = dbPath;
  });

  afterEach(() => {
    delete process.env.TIM_DB_PATH;
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('writes dependency-map entry and baseline on refresh', async () => {
    const outDir = path.join(workDir, 'graphify-out');
    fs.mkdirSync(outDir, { recursive: true });
    const graphPath = path.join(outDir, 'graph.json');
    fs.writeFileSync(graphPath, JSON.stringify(sampleGraph));

    const result = await runCodebaseRefresh({
      project: 'P0063',
      graphPath,
      baselinePath: path.join(outDir, 'baseline-summary.json'),
      dryRun: false,
      dbPath,
    });

    expect(result.timAction).toBe('created');
    expect(fs.existsSync(path.join(outDir, 'baseline-summary.json'))).toBe(true);

    const store = new TimStore(dbPath);
    const project = await store.requireProject('P0063');
    const sections = await store.getChildren(project.id);
    const codebase = sections.find(s => s.title === 'Codebase');
    expect(codebase).toBeDefined();
    const children = await store.getChildren(codebase!.id);
    const dep = children.find(
      c => (c.metadata as Record<string, unknown>)?.codebaseSection === 'dependency-map',
    );
    expect(dep?.content).toContain('tim-cli');
    store.close();
  });

  it('dry-run leaves DB and baseline untouched', async () => {
    const outDir = path.join(workDir, 'out');
    fs.mkdirSync(outDir);
    const graphPath = path.join(outDir, 'graph.json');
    fs.writeFileSync(graphPath, JSON.stringify(sampleGraph));
    const baselinePath = path.join(outDir, 'baseline-summary.json');

    await runCodebaseRefresh({
      project: 'P0063',
      graphPath,
      baselinePath,
      dryRun: true,
      dbPath,
    });

    expect(fs.existsSync(baselinePath)).toBe(false);
  });

  it('loadGraphJson rejects invalid files', () => {
    const bad = path.join(workDir, 'bad.json');
    fs.writeFileSync(bad, '{"nodes":[]}');
    expect(() => loadGraphJson(bad)).toThrow(/links/);
  });
});
