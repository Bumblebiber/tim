import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionManager, TimStore, findChildByKind, KIND_BATCH, KIND_SUMMARY_ROOT } from 'tim-store';
import { collectDirectiveBriefing, recentExchanges, stripMidSessionPlanningLines } from '../session-briefing.js';

describe('recentExchanges harness folding (m1)', () => {
  let store: TimStore;
  let sessions: SessionManager;

  beforeEach(async () => {
    store = new TimStore(':memory:');
    sessions = new SessionManager(store);
    await store.createProject('P0200');
    await sessions.startProjectSession({
      sessionId: 'brief-harness',
      projectId: 'P0200',
      agentName: 'a',
      cwd: '/',
      harness: 't',
      batchSize: 5,
    });
  });

  afterEach(() => {
    store.close();
  });

  it('folds agent replies to harness-only users into the previous countable turn', async () => {
    await sessions.logExchange('brief-harness', [
      { role: 'user', content: 'Q1' },
      { role: 'agent', content: 'A1' },
      { role: 'user', content: '<task-notification>done</task-notification>' },
      { role: 'agent', content: 'Worker merged feature X' },
    ]);

    const blocks = await recentExchanges(store, 'brief-harness', 4000);
    const joined = blocks.join('\n');
    expect(joined).toContain('Q1');
    expect(joined).toContain('Worker merged feature X');
    expect(joined).not.toContain('task-notification');
  });
});

describe('stripMidSessionPlanningLines', () => {
  it('drops Open/Next/WIP bullets and adds a superseded marker', () => {
    const body = [
      '- Diagnosis still open.',
      '- Open: usage-spender not live',
      '- Next: diagnose role_alternation',
      '- WIP: nothing',
    ].join('\n');
    const out = stripMidSessionPlanningLines(body);
    expect(out).toContain('superseded by handoff');
    expect(out).toContain('Diagnosis still open');
    expect(out).not.toContain('role_alternation');
    expect(out).not.toContain('usage-spender not live');
  });
});

describe('handoff newer than batch summary (ubun-1009)', () => {
  let store: TimStore;
  let sessions: SessionManager;

  beforeEach(async () => {
    store = new TimStore(':memory:');
    sessions = new SessionManager(store);
    await store.createProject('P0202');
    await sessions.startProjectSession({
      sessionId: 'sess-batch-handoff',
      projectId: 'P0202',
      agentName: 'a',
      cwd: '/',
      harness: 't',
      batchSize: 5,
    });
    for (let i = 1; i <= 3; i++) {
      await sessions.logExchange('sess-batch-handoff', [
        { role: 'user', content: `work ${i}` },
        { role: 'agent', content: `ok ${i}` },
      ]);
    }
  });

  afterEach(() => {
    store.close();
  });

  it('omits stale batch Open/Next when the handoff checkpoint is newer', async () => {
    const summaryNode = await findChildByKind(store, 'sess-batch-handoff', KIND_SUMMARY_ROOT);
    expect(summaryNode).toBeTruthy();
    const batch = await store.write([
      '- usage-spender looked down mid-session.',
      '- Open: usage-spender not live',
      '- Next: diagnose role_alternation, then repair',
    ].join('\n'), {
      parentId: summaryNode!.id,
      metadata: { kind: KIND_BATCH, batch_index: 1 },
    });
    store.getDb().prepare(
      'UPDATE entries SET created_at = ?, updated_at = ? WHERE id = ?',
    ).run('2026-10-09T10:00:00.000Z', '2026-10-09T10:00:00.000Z', batch.id);

    await sessions.checkpoint('sess-batch-handoff', {
      handoffNote: 'done: repair live | next: 10-12 live night + Benni decisions',
    });
    const refreshed = await findChildByKind(store, 'sess-batch-handoff', KIND_SUMMARY_ROOT);
    expect(refreshed).toBeTruthy();
    await store.update(refreshed!.id, {
      metadata: { ...refreshed!.metadata, summary: '' },
    });
    for (const child of await store.getChildren(refreshed!.id)) {
      if (child.metadata.kind === 'checkpoint') {
        await store.update(child.id, { content: '' });
      }
    }

    const briefing = await collectDirectiveBriefing(store, 'P0202', 8000, true);
    const summary = briefing?.previousSessionSummary ?? '';
    expect(summary).toContain('superseded by handoff');
    expect(summary).toContain('handoff: done: repair live');
    expect(summary).not.toContain('diagnose role_alternation');
    expect(summary).not.toContain('Open: usage-spender');
  });
});

describe('latest handoff note on checkpoint children (m3)', () => {
  let store: TimStore;
  let sessions: SessionManager;

  beforeEach(async () => {
    store = new TimStore(':memory:');
    sessions = new SessionManager(store);
    await store.createProject('P0201');
    await sessions.startProjectSession({
      sessionId: 'handoff-prev',
      projectId: 'P0201',
      agentName: 'a',
      cwd: '/',
      harness: 't',
      batchSize: 5,
    });
    await sessions.logExchange('handoff-prev', [
      { role: 'user', content: 'older session work' },
      { role: 'agent', content: 'done' },
      { role: 'user', content: 'more' },
      { role: 'agent', content: 'ok' },
    ]);
    await sessions.startProjectSession({
      sessionId: 'handoff-child',
      projectId: 'P0201',
      agentName: 'a',
      cwd: '/',
      harness: 't',
      batchSize: 5,
    });
  });

  afterEach(() => {
    store.close();
  });

  it('picks the newest checkpoint child handoff note', async () => {
    const summaryNode = await findChildByKind(store, 'handoff-child', 'session-summary-root');
    expect(summaryNode).toBeTruthy();
    await store.write('cp1', {
      parentId: summaryNode!.id,
      metadata: { kind: 'checkpoint', handoff_note: 'older note' },
    });
    const cp2 = await store.write('cp2', {
      parentId: summaryNode!.id,
      metadata: { kind: 'checkpoint', handoff_note: 'newest note' },
    });
    await store.updateSync(cp2.id, { metadata: { kind: 'checkpoint', handoff_note: 'newest note' } });

    const briefing = await collectDirectiveBriefing(store, 'P0201', 8000, true);
    expect(briefing?.latestHandoffNote).toBe('newest note');
  });
});
