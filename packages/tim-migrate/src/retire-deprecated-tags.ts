// Strip every DEPRECATED_TAG from existing rows — the retired structural tags
// (#exchange, #session, #sessions, #exchanges, #checkpoint) plus the older status and
// priority tags. The scope is the full set on purpose: store.update() strips all of them
// on write anyway, so a narrower selector would only skip rows, never spare a tag.
// Idempotent: re-running on a clean DB is a no-op.

import { stripDeprecatedTags } from 'tim-core';
import type { TimStore } from 'tim-store';

export interface RetireDeprecatedTagsEntryResult {
  id: string;
  title: string;
  oldTags: string[];
  newTags: string[];
  removed: string[];
  changed: boolean;
}

export interface RetireDeprecatedTagsReport {
  scanned: number;
  migrated: number;
  skipped: number;
  errors: Array<{ id: string; error: string }>;
  sampleChanges: RetireDeprecatedTagsEntryResult[];
}

/**
 * Scan live entries and strip every deprecated tag via store.update (staging/LWW).
 * Explicit opt-in: `tim migrate retire-deprecated-tags`.
 */
export async function migrateRetireDeprecatedTags(
  store: TimStore,
  options: { dryRun?: boolean; sampleLimit?: number } = {},
): Promise<RetireDeprecatedTagsReport> {
  const dryRun = options.dryRun === true;
  const sampleLimit = options.sampleLimit ?? 20;
  const db = store.getDb();

  const rows = db.prepare(`
    SELECT id, title, tags
    FROM entries
    WHERE irrelevant = 0
      AND tombstoned_at IS NULL
  `).all() as Array<{ id: string; title: string; tags: string }>;

  const report: RetireDeprecatedTagsReport = {
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

    const result: RetireDeprecatedTagsEntryResult = {
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
