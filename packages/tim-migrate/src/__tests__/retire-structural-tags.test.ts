import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TimStore } from 'tim-store';
import { migrateRetireStructuralTags } from '../retire-structural-tags.js';

describe('migrateRetireStructuralTags', () => {
  let store: TimStore;

  beforeEach(() => {
    store = new TimStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  function seedLegacyTags(id: string, tags: string[]) {
    const now = new Date().toISOString();
    store.getDb().prepare(`
      INSERT INTO entries (id, title, content, tags, metadata, created_at, accessed_at, irrelevant)
      VALUES (?, ?, '', ?, '{}', ?, ?, 0)
    `).run(id, 'Tagged', JSON.stringify(tags), now, now);
  }

  it('strips retired structural tags and keeps #session-summary', async () => {
    seedLegacyTags('legacy-1', ['#exchange', '#session-summary']);
    const report = await migrateRetireStructuralTags(store, { dryRun: false });
    expect(report.migrated).toBe(1);
    const read = await store.read('legacy-1');
    expect(read!.tags).toEqual(['#session-summary']);
  });

  it('dry-run does not modify rows', async () => {
    seedLegacyTags('legacy-2', ['#exchange', '#session-summary']);
    const report = await migrateRetireStructuralTags(store, { dryRun: true });
    expect(report.migrated).toBe(1);
    const row = store.getDb().prepare('SELECT tags FROM entries WHERE id = ?').get('legacy-2') as {
      tags: string;
    };
    expect(JSON.parse(row.tags)).toEqual(['#exchange', '#session-summary']);
  });
});
