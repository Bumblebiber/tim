/** Pure graphify graph.json → dependency-map summary and diff (no TIM I/O). */

export interface GraphifyNode {
  id: string;
  label?: string;
  source_file?: string;
  community?: number;
}

export interface GraphifyLink {
  source: string;
  target: string;
  relation?: string;
  confidence?: string;
}

export interface GraphifyGraph {
  nodes: GraphifyNode[];
  links: GraphifyLink[];
}

export interface CrossPackageEdge {
  from: string;
  to: string;
  relations: Record<string, number>;
  inferredCount: number;
}

export interface CodebaseGraphSummary {
  nodeCount: number;
  linkCount: number;
  inferredLinkCount: number;
  communityCount: number;
  packages: string[];
  crossPackageEdges: CrossPackageEdge[];
}

export interface CodebaseGraphDiff {
  initial: boolean;
  nodeCountDelta: number;
  linkCountDelta: number;
  inferredLinkCountDelta: number;
  packagesAdded: string[];
  packagesRemoved: string[];
  edgesAdded: CrossPackageEdge[];
  edgesRemoved: CrossPackageEdge[];
}

const PKG_RE = /^packages\/([^/]+)\//;

export function packageFromSourceFile(sourceFile: string | undefined): string | undefined {
  if (!sourceFile) return undefined;
  const m = sourceFile.match(PKG_RE);
  return m ? m[1] : undefined;
}

function edgeKey(from: string, to: string): string {
  return `${from}\t${to}`;
}

function parseEdgeKey(key: string): { from: string; to: string } {
  const [from, to] = key.split('\t');
  return { from, to };
}

/** Aggregate cross-package links from graphify output. */
export function summarizeGraph(graph: GraphifyGraph): CodebaseGraphSummary {
  const idToNode = new Map(graph.nodes.map(n => [n.id, n]));
  const packages = new Set<string>();
  for (const node of graph.nodes) {
    const pkg = packageFromSourceFile(node.source_file);
    if (pkg) packages.add(pkg);
  }

  const bucket = new Map<string, { relations: Record<string, number>; inferredCount: number }>();

  for (const link of graph.links ?? []) {
    const s = idToNode.get(link.source);
    const t = idToNode.get(link.target);
    const fromPkg = packageFromSourceFile(s?.source_file);
    const toPkg = packageFromSourceFile(t?.source_file);
    if (!fromPkg || !toPkg || fromPkg === toPkg) continue;

    const key = edgeKey(fromPkg, toPkg);
    let row = bucket.get(key);
    if (!row) {
      row = { relations: {}, inferredCount: 0 };
      bucket.set(key, row);
    }
    const rel = link.relation ?? 'unknown';
    row.relations[rel] = (row.relations[rel] ?? 0) + 1;
    if (link.confidence === 'INFERRED') row.inferredCount += 1;
  }

  const crossPackageEdges: CrossPackageEdge[] = [...bucket.entries()]
    .map(([key, row]) => {
      const { from, to } = parseEdgeKey(key);
      return { from, to, relations: row.relations, inferredCount: row.inferredCount };
    })
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  const communities = new Set(
    graph.nodes.map(n => n.community).filter((c): c is number => c !== undefined),
  );

  const inferredLinkCount = (graph.links ?? []).filter(l => l.confidence === 'INFERRED').length;

  return {
    nodeCount: graph.nodes.length,
    linkCount: (graph.links ?? []).length,
    inferredLinkCount,
    communityCount: communities.size,
    packages: [...packages].sort(),
    crossPackageEdges,
  };
}

function edgeSignature(e: CrossPackageEdge): string {
  return edgeKey(e.from, e.to);
}

function edgesBySignature(edges: CrossPackageEdge[]): Map<string, CrossPackageEdge> {
  return new Map(edges.map(e => [edgeSignature(e), e]));
}

export function diffSummaries(
  previous: CodebaseGraphSummary | null,
  current: CodebaseGraphSummary,
): CodebaseGraphDiff {
  if (!previous) {
    return {
      initial: true,
      nodeCountDelta: 0,
      linkCountDelta: 0,
      inferredLinkCountDelta: 0,
      packagesAdded: current.packages,
      packagesRemoved: [],
      edgesAdded: current.crossPackageEdges,
      edgesRemoved: [],
    };
  }

  const prevPkgs = new Set(previous.packages);
  const curPkgs = new Set(current.packages);
  const packagesAdded = current.packages.filter(p => !prevPkgs.has(p));
  const packagesRemoved = previous.packages.filter(p => !curPkgs.has(p));

  const prevEdges = edgesBySignature(previous.crossPackageEdges);
  const curEdges = edgesBySignature(current.crossPackageEdges);

  const edgesAdded: CrossPackageEdge[] = [];
  for (const [sig, edge] of curEdges) {
    if (!prevEdges.has(sig)) edgesAdded.push(edge);
  }
  const edgesRemoved: CrossPackageEdge[] = [];
  for (const [sig, edge] of prevEdges) {
    if (!curEdges.has(sig)) edgesRemoved.push(edge);
  }

  return {
    initial: false,
    nodeCountDelta: current.nodeCount - previous.nodeCount,
    linkCountDelta: current.linkCount - previous.linkCount,
    inferredLinkCountDelta: current.inferredLinkCount - previous.inferredLinkCount,
    packagesAdded,
    packagesRemoved,
    edgesAdded,
    edgesRemoved,
  };
}

export function formatRefreshNotification(
  project: string,
  diff: CodebaseGraphDiff,
  current: CodebaseGraphSummary,
): string {
  const lines: string[] = [];
  if (diff.initial) {
    lines.push(`[tim codebase-refresh] ${project}: initial dependency-map baseline (${current.packages.length} packages, ${current.crossPackageEdges.length} cross-package edges).`);
    return lines.join('\n');
  }

  const changes: string[] = [];
  if (diff.nodeCountDelta !== 0) changes.push(`nodes ${diff.nodeCountDelta >= 0 ? '+' : ''}${diff.nodeCountDelta}`);
  if (diff.linkCountDelta !== 0) changes.push(`links ${diff.linkCountDelta >= 0 ? '+' : ''}${diff.linkCountDelta}`);
  if (diff.inferredLinkCountDelta !== 0) {
    changes.push(`inferred ${diff.inferredLinkCountDelta >= 0 ? '+' : ''}${diff.inferredLinkCountDelta}`);
  }
  if (diff.packagesAdded.length) {
    changes.push(`new packages: ${diff.packagesAdded.join(', ')}`);
  }
  if (diff.packagesRemoved.length) {
    changes.push(`removed packages: ${diff.packagesRemoved.join(', ')}`);
  }
  for (const e of diff.edgesAdded) {
    const rels = Object.entries(e.relations).map(([r, n]) => `${r}×${n}`).join(', ');
    changes.push(`${e.from} → ${e.to} (${rels || 'edge'}${e.inferredCount ? `, ${e.inferredCount} inferred` : ''})`);
  }
  for (const e of diff.edgesRemoved) {
    changes.push(`dropped ${e.from} → ${e.to}`);
  }

  if (changes.length === 0) {
    lines.push(`[tim codebase-refresh] ${project}: no dependency-map changes since last run.`);
  } else {
    lines.push(`[tim codebase-refresh] ${project}: ${changes.join('; ')}`);
  }
  return lines.join('\n');
}

export function renderDependencyMapMarkdown(
  summary: CodebaseGraphSummary,
  diff: CodebaseGraphDiff | null,
  opts: { graphPath: string; refreshedAt: string },
): string {
  const lines: string[] = [
    '# Dependency map (graphify)',
    '',
    `_Auto-refreshed at ${opts.refreshedAt} from \`${opts.graphPath}\`._`,
    '',
    '## Snapshot',
    '',
    `- Nodes: ${summary.nodeCount}`,
    `- Links: ${summary.linkCount} (${summary.inferredLinkCount} INFERRED)`,
    `- Communities: ${summary.communityCount}`,
    `- Workspace packages: ${summary.packages.join(', ')}`,
    '',
    '## Cross-package edges',
    '',
  ];

  if (summary.crossPackageEdges.length === 0) {
    lines.push('_No cross-package edges in graph._');
  } else {
    for (const e of summary.crossPackageEdges) {
      const rels = Object.entries(e.relations)
        .map(([r, n]) => `${r} (${n})`)
        .join(', ');
      const inferred = e.inferredCount ? ` — ${e.inferredCount} INFERRED` : '';
      lines.push(`- **${e.from}** → **${e.to}**: ${rels}${inferred}`);
    }
  }

  if (diff && !diff.initial) {
    lines.push('', '## Changes since last refresh', '');
    const parts: string[] = [];
    if (diff.packagesAdded.length) parts.push(`Added packages: ${diff.packagesAdded.join(', ')}`);
    if (diff.packagesRemoved.length) parts.push(`Removed packages: ${diff.packagesRemoved.join(', ')}`);
    if (diff.edgesAdded.length) {
      parts.push(
        'New cross-package edges: ' +
          diff.edgesAdded.map(e => `${e.from}→${e.to}`).join(', '),
      );
    }
    if (diff.edgesRemoved.length) {
      parts.push(
        'Removed cross-package edges: ' +
          diff.edgesRemoved.map(e => `${e.from}→${e.to}`).join(', '),
      );
    }
    if (parts.length === 0) parts.push('No structural changes.');
    lines.push(...parts.map(p => `- ${p}`));
  }

  return lines.join('\n');
}
