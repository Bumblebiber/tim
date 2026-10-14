import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOOPS, assertLoopDocs } from '../self-improving-loops.mjs';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

describe('self-improving loops registry', () => {
  it('lists five loops including loading (briefing)', () => {
    expect(LOOPS.map((l) => l.id)).toEqual([
      'installation',
      'loading',
      'sync',
      'hook',
      'schema-migration',
    ]);
  });

  it('has README hub and every goals/ledger pair on disk', () => {
    const hub = join(root, 'docs/self-improving-loops/README.md');
    expect(readFileSync(hub, 'utf8')).toContain('ubun-0603');
    assertLoopDocs();
  });

  it('declares at least one gate per loop', () => {
    for (const loop of LOOPS) {
      expect(loop.gates.length, loop.id).toBeGreaterThan(0);
    }
  });
});
