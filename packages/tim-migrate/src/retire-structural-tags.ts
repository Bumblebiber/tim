// Retire structural session tags (#exchange, #session, #exchanges, #checkpoint) from
// existing rows. Idempotent: re-running on a clean DB is a no-op.

import { stripDeprecatedTags } from 'tim-core';
import type { TimStore } from 'tim-store';

export interface RetireStructuralTagsEntryResult {
  id: string;
  title: string;
  oldTags: string[];
  newTags: string[];
  removed: string[];
  changed: boolean;
}

export interface RetireStructuralTagsReport {
  scanned: number;
  migrated: number;
  skipped: number;
  errors: Array<{ id: string; error: string }>;
  sampleChanges: RetireStructuralTagsEntryResult[];
}

/**
 * Scan live entries and strip retired structural tags via store.update (staging/LWW).
 * Explicit opt-in: `tim migrate retire-structural-tags`.
 */
export async function migrateRetireStructuralTags(
  store: TimStore,
  options: { dryRun?: boolean; sampleLimit?: number } = {},
): Promise<RetireStructuralTagsReport> {
  const dryRun = options.dryRun === true;
  const sampleLimit = options.sampleLimit ?? 20;
  const db = store.getDb();

  const rows = db.prepare(`
    SELECT id, title, tags
    FROM entries
    WHERE irrelevant = 0
      AND tombstoned_at IS NULL
  `).all() as Array<{ id: string; title: string; tags: string }>;

  const report: RetireStructuralTagsReport = {
    scanned: rows.length,
    migrated: 0,
    skipped: 0,
    errors: [],
    sampleChanges: [],
  };

  for (const row of rows) {
    let oldTags: string[];
    try {
      const parsed = JSON.parse(row.tags);
      oldTags = Array.isArray(parsed) ? parsed.filter(t => typeof t === 'string') : [];
    } catch {
      oldTags = [];
    }

    const { clean, removed } = stripDeprecatedTags(oldTags);
    if (removed.length === 0) {
      report.skipped++;
      continue;
    }

    const result: RetireStructuralTagsEntryResult = {
      id: row.id,
      title: row.title,
      oldTags: [...oldTags],
      newTags: clean,
      removed,
      changed: true,
    };

    if (!dryRun) {
      try {
        await store.update(row.id, { tags: clean });
        report.migrated++;
        if (report.sampleChanges.length < sampleLimit) {
          report.sampleChanges.push(result);
        }
      } catch (err) {
        report.errors.push({
          id: row.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      report.migrated++;
      if (report.sampleChanges.length < sampleLimit) {
        report.sampleChanges.push(result);
      }
    }
  }

  return report;
}
