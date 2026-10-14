import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TimStore } from 'tim-store';
import { parseArgs, valueOptionsFor } from './args.js';
import { getDbPath } from './db-path.js';
import {
  type CodebaseGraphSummary,
  type GraphifyGraph,
  diffSummaries,
  formatRefreshNotification,
  renderDependencyMapMarkdown,
  summarizeGraph,
} from './codebase-refresh-graph.js';

export const DEFAULT_GRAPHIFY_OUT = path.join(os.homedir(), '.tim', 'graphify-out');
export const BASELINE_FILENAME = 'baseline-summary.json';
export const GRAPH_FILENAME = 'graph.json';

export function defaultGraphPath(outDir: string = DEFAULT_GRAPHIFY_OUT): string {
  return path.join(outDir, GRAPH_FILENAME);
}

export function defaultBaselinePath(outDir: string = DEFAULT_GRAPHIFY_OUT): string {
  return path.join(outDir, BASELINE_FILENAME);
}

export function loadGraphJson(graphPath: string): GraphifyGraph {
  const raw = fs.readFileSync(graphPath, 'utf8');
  const parsed = JSON.parse(raw) as GraphifyGraph;
  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.links)) {
    throw new Error(`Invalid graphify graph at ${graphPath}: expected nodes and links arrays`);
  }
  return parsed;
}

export function loadBaseline(baselinePath: string): CodebaseGraphSummary | null {
  if (!fs.existsSync(baselinePath)) return null;
  return JSON.parse(fs.readFileSync(baselinePath, 'utf8')) as CodebaseGraphSummary;
}

export function saveBaseline(baselinePath: string, summary: CodebaseGraphSummary): void {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
}

export async function findCodebaseParentId(store: TimStore, projectLabel: string): Promise<string> {
  const project = await store.requireProject(projectLabel);
  const children = await store.getChildren(project.id);
  const codebase =
    children.find(c => c.title === 'Codebase') ??
    children.find(c => c.title.startsWith('Codebase'));
  if (!codebase) {
    throw new Error(`Project ${projectLabel} has no Codebase section`);
  }
  return codebase.id;
}

const DEPENDENCY_MAP_SECTION = 'dependency-map';

export async function upsertDependencyMapEntry(
  store: TimStore,
  codebaseParentId: string,
  bodyMarkdown: string,
): Promise<'created' | 'updated'> {
  const children = await store.getChildren(codebaseParentId);
  const existing = children.find(
    c => (c.metadata as Record<string, unknown> | undefined)?.codebaseSection === DEPENDENCY_MAP_SECTION,
  );

  const tags = ['#codebase', '#dependency-map', '#graphify'];
  const metadata = { codebaseSection: DEPENDENCY_MAP_SECTION, type: 'standard' as const };

  if (existing) {
    await store.update(existing.id, { content: bodyMarkdown, tags, metadata });
    return 'updated';
  }

  const title = 'Dependency map (graphify)';
  await store.write(`${title}\n\n${bodyMarkdown}`, {
    parentId: codebaseParentId,
    tags,
    metadata: { ...metadata, order: children.length },
  });
  return 'created';
}

export interface CodebaseRefreshResult {
  dryRun: boolean;
  project: string;
  graphPath: string;
  summary: CodebaseGraphSummary;
  diff: ReturnType<typeof diffSummaries>;
  timAction?: 'created' | 'updated' | 'skipped';
}

export async function runCodebaseRefresh(opts: {
  project: string;
  graphPath: string;
  baselinePath: string;
  dryRun: boolean;
  dbPath?: string;
}): Promise<CodebaseRefreshResult> {
  const summary = summarizeGraph(loadGraphJson(opts.graphPath));
  const previous = loadBaseline(opts.baselinePath);
  const diff = diffSummaries(previous, summary);

  const notification = formatRefreshNotification(opts.project, diff, summary);
  console.log(notification);

  const refreshedAt = new Date().toISOString();
  const markdown = renderDependencyMapMarkdown(summary, diff, {
    graphPath: opts.graphPath,
    refreshedAt,
  });

  let timAction: CodebaseRefreshResult['timAction'] = 'skipped';
  if (!opts.dryRun) {
    const store = new TimStore(opts.dbPath ?? getDbPath());
    try {
      const codebaseId = await findCodebaseParentId(store, opts.project);
      timAction = await upsertDependencyMapEntry(store, codebaseId, markdown);
      saveBaseline(opts.baselinePath, summary);
      console.log(`[tim codebase-refresh] TIM ${timAction} dependency-map under ${opts.project}/Codebase`);
    } finally {
      store.close();
    }
  }

  return {
    dryRun: opts.dryRun,
    project: opts.project,
    graphPath: opts.graphPath,
    summary,
    diff,
    timAction,
  };
}

function printHelp(): void {
  console.log(`tim codebase-refresh — sync graphify dependency-map into TIM Codebase

Usage:
  tim codebase-refresh [--dry-run] [--package P0063] [--graph <path>] [--out-dir <dir>]

Defaults:
  --package P0063
  graph: ~/.tim/graphify-out/graph.json
  baseline: ~/.tim/graphify-out/baseline-summary.json
`);
}

export async function cmdCodebaseRefresh(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args, { valueOptions: valueOptionsFor('codebase-refresh') });
  const dryRun = flags['dry-run'] === 'true';

  if (flags.help === 'true' || positional[0] === 'help') {
    printHelp();
    return;
  }

  const project = flags.package ?? 'P0063';
  const outDir = flags['out-dir'] ?? DEFAULT_GRAPHIFY_OUT;
  const graphPath = flags.graph ?? defaultGraphPath(outDir);
  const baselinePath = defaultBaselinePath(outDir);

  if (!fs.existsSync(graphPath)) {
    console.error(`graphify graph not found: ${graphPath}`);
    console.error('Run scripts/graphify-tim.sh first (or pass --graph).');
    process.exit(1);
  }

  await runCodebaseRefresh({
    project,
    graphPath,
    baselinePath,
    dryRun,
  });
}
