import { describe, expect, it } from 'vitest';
import {
  diffSummaries,
  formatRefreshNotification,
  packageFromSourceFile,
  summarizeGraph,
  type GraphifyGraph,
} from '../codebase-refresh-graph.js';

const miniGraph: GraphifyGraph = {
  nodes: [
    { id: 'a1', source_file: 'packages/tim-cli/src/a.ts' },
    { id: 'a2', source_file: 'packages/tim-cli/src/b.ts' },
    { id: 'b1', source_file: 'packages/tim-core/src/c.ts', community: 1 },
    { id: 'c1', source_file: 'packages/tim-store/src/d.ts', community: 2 },
  ],
  links: [
    {
      source: 'a1',
      target: 'b1',
      relation: 'imports',
      confidence: 'EXTRACTED',
    },
    {
      source: 'a2',
      target: 'b1',
      relation: 'calls',
      confidence: 'INFERRED',
    },
    {
      source: 'b1',
      target: 'c1',
      relation: 'imports',
      confidence: 'EXTRACTED',
    },
    { source: 'a1', target: 'a2', relation: 'contains', confidence: 'EXTRACTED' },
  ],
};

describe('codebase-refresh-graph', () => {
  it('maps source files to workspace package names', () => {
    expect(packageFromSourceFile('packages/tim-mcp/src/x.ts')).toBe('tim-mcp');
    expect(packageFromSourceFile('README.md')).toBeUndefined();
  });

  it('summarizes cross-package edges and inferred counts', () => {
    const summary = summarizeGraph(miniGraph);
    expect(summary.packages).toEqual(['tim-cli', 'tim-core', 'tim-store']);
    expect(summary.inferredLinkCount).toBe(1);
    expect(summary.crossPackageEdges).toEqual([
      {
        from: 'tim-cli',
        to: 'tim-core',
        relations: { imports: 1, calls: 1 },
        inferredCount: 1,
      },
      {
        from: 'tim-core',
        to: 'tim-store',
        relations: { imports: 1 },
        inferredCount: 0,
      },
    ]);
  });

  it('diffs summaries and formats notifications', () => {
    const v1 = summarizeGraph(miniGraph);
    const v2Graph: GraphifyGraph = {
      ...miniGraph,
      nodes: [
        ...miniGraph.nodes,
        { id: 'd1', source_file: 'packages/tim-hooks/src/e.ts' },
      ],
      links: [
        ...miniGraph.links,
        {
          source: 'a1',
          target: 'd1',
          relation: 'imports',
          confidence: 'EXTRACTED',
        },
      ],
    };
    const v2 = summarizeGraph(v2Graph);
    const diff = diffSummaries(v1, v2);
    expect(diff.packagesAdded).toEqual(['tim-hooks']);
    expect(diff.edgesAdded.some(e => e.from === 'tim-cli' && e.to === 'tim-hooks')).toBe(true);

    const msg = formatRefreshNotification('P0063', diff, v2);
    expect(msg).toContain('tim-hooks');
    expect(msg).toContain('tim-cli → tim-hooks');
  });

  it('reports initial baseline', () => {
    const summary = summarizeGraph(miniGraph);
    const diff = diffSummaries(null, summary);
    expect(diff.initial).toBe(true);
    expect(formatRefreshNotification('P0063', diff, summary)).toContain('initial');
  });
});
