import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TenantRegistry } from '../tenant-registry.js';
import { createFile, pushBlobs, pullBlobs, compactBlobs } from '../storage.js';

describe('compactBlobs', () => {
  it('drops only old, covered versions and keeps pagination intact', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tim-compact-'));
    const registry = new TenantRegistry(tmp);
    try {
      const t = registry.register('free');
      createFile(registry, t.id, 'f1', 's');
      const push = (key: string, id: string, data: string, at: string) =>
        pushBlobs(registry, t.id, 'free', 'f1', key, [{ proposed_id: id, data, device_id: 'd', updated_at: at }]);
      push('k1', 'a', 'a1', '2026-01-01T00:00:00.000Z');
      push('k2', 'a', 'a2', '2026-01-02T00:00:00.000Z');
      push('k3', 'b', 'b1', '2026-01-01T00:00:00.000Z');
      push('k4', 'c', 'c-new', '2026-02-01T00:00:00.000Z');
      push('k5', 'c', 'c-old-late', '2026-01-01T00:00:00.000Z'); // higher id, older LWW: must not cover c-new
      const db = registry.getTenantDb(t.id);
      db.prepare("UPDATE blobs SET received_at='2026-01-01T00:00:00.000Z' WHERE id IN (1,2,3,4)").run();
      db.close();
      // id 5 is recent; id 1 covered+old -> deleted; id 4 not covered by newer-LWW -> kept; id 2,3 latest -> kept
      expect(compactBlobs(registry, t.id, 30, new Date('2026-03-01T00:00:00.000Z'))).toBe(1);
      const pull = pullBlobs(registry, t.id, 'f1', undefined, 100);
      if ('error' in pull) throw new Error(pull.error);
      expect((pull.blobs as { id: number }[]).map(b => b.id)).toEqual([2, 3, 4, 5]);
      // cursor pointing at the deleted id still paginates
      const gen = pull.generation;
      const rest = pullBlobs(registry, t.id, 'f1', `${gen}|1`, 100);
      if ('error' in rest) throw new Error(rest.error);
      expect(rest.blobs).toHaveLength(4);
    } finally { registry.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  });
});
