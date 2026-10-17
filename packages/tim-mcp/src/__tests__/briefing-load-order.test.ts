import { describe, it, expect } from 'vitest';
import type { Entry } from 'tim-core';
import { compareBriefingEntries } from '../briefing-load.js';

const task = (id: string, priority?: string): Entry =>
  ({ id, title: id, createdAt: '2026-01-01', metadata: { task: { status: 'todo', priority } } }) as unknown as Entry;

describe('compareBriefingEntries task priority', () => {
  it('sorts P1 before P3 and before legacy medium; unprioritised last', () => {
    const sorted = [task('p3', 'P3'), task('none'), task('med', 'medium'), task('p1', 'P1'), task('hi', 'high')]
      .sort(compareBriefingEntries)
      .map((e) => e.id);
    expect(sorted.indexOf('p1')).toBeLessThan(sorted.indexOf('p3'));
    expect(sorted.indexOf('p1')).toBeLessThan(sorted.indexOf('med'));
    expect(sorted[sorted.length - 1]).toBe('none');
  });
});
