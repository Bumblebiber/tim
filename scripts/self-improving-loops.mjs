#!/usr/bin/env node
/**
 * Registry and fast gates for TIM self-improving loops (docs/self-improving-loops/).
 *
 *   node scripts/self-improving-loops.mjs list
 *   node scripts/self-improving-loops.mjs check [--with-docker]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {{ id: string, label: string, goals: string, ledger: string, gates: { label: string, argv: string[], optionalDocker?: boolean }[] }[]} */
export const LOOPS = [
  {
    id: 'installation',
    label: 'Installation',
    goals: 'docs/self-improving-loops/installation-loop/GOALS.md',
    ledger: 'docs/self-improving-loops/installation-loop/LEDGER.md',
    gates: [
      {
        label: 'sandbox fresh+installer',
        argv: ['bash', 'scripts/sandbox/run.sh'],
        optionalDocker: true,
      },
    ],
  },
  {
    id: 'loading',
    label: 'Loading (briefing)',
    goals: 'docs/briefing-loop/GOALS.md',
    ledger: 'docs/briefing-loop/LEDGER.md',
    gates: [
      { label: 'briefing-eval selftest', argv: ['node', 'scripts/briefing-eval.mjs', '--selftest'] },
    ],
  },
  {
    id: 'sync',
    label: 'Sync',
    goals: 'docs/self-improving-loops/sync-loop/GOALS.md',
    ledger: 'docs/self-improving-loops/sync-loop/LEDGER.md',
    gates: [
      {
        label: 'sync integration',
        argv: [
          'npx',
          'vitest',
          'run',
          'packages/tim-sync-client/src/__tests__/integration.test.ts',
        ],
      },
    ],
  },
  {
    id: 'hook',
    label: 'Hook',
    goals: 'docs/self-improving-loops/hook-loop/GOALS.md',
    ledger: 'docs/self-improving-loops/hook-loop/LEDGER.md',
    gates: [
      {
        label: 'summarizer worker env',
        argv: [
          'npx',
          'vitest',
          'run',
          'packages/tim-summarizer/src/__tests__/summarizer-worker-env.test.ts',
        ],
      },
      {
        label: 'git-hooks probe',
        argv: ['npx', 'vitest', 'run', 'scripts/__tests__/git-hooks.test.mjs'],
      },
    ],
  },
  {
    id: 'schema-migration',
    label: 'Schema migration',
    goals: 'docs/self-improving-loops/schema-migration-loop/GOALS.md',
    ledger: 'docs/self-improving-loops/schema-migration-loop/LEDGER.md',
    gates: [
      {
        label: 'migration suite',
        argv: [
          'npx',
          'vitest',
          'run',
          'packages/tim-store/src/__tests__/migrations.test.ts',
          'packages/tim-store/src/__tests__/migration-gate.test.ts',
          'packages/tim-cli/src/__tests__/migrate-schema-guard.test.ts',
        ],
      },
    ],
  },
];

function runGate(gate) {
  const r = spawnSync(gate.argv[0], gate.argv.slice(1), {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  const ok = r.status === 0;
  const detail = (r.stderr || r.stdout || '').trim().split('\n').slice(-5).join('\n');
  return { ok, detail, status: r.status ?? 1 };
}

export function assertLoopDocs() {
  const missing = [];
  for (const loop of LOOPS) {
    for (const rel of [loop.goals, loop.ledger]) {
      if (!existsSync(join(root, rel))) missing.push(rel);
    }
  }
  if (missing.length) {
    throw new Error(`Missing loop docs:\n${missing.map((m) => `  - ${m}`).join('\n')}`);
  }
}

export function checkLoops({ withDocker = false } = {}) {
  assertLoopDocs();
  const results = [];
  for (const loop of LOOPS) {
    for (const gate of loop.gates) {
      if (gate.optionalDocker && !withDocker) {
        results.push({ loop: loop.id, gate: gate.label, skipped: true });
        continue;
      }
      const out = runGate(gate);
      results.push({ loop: loop.id, gate: gate.label, ...out });
      if (!out.ok) return { ok: false, results };
    }
  }
  return { ok: true, results };
}

function cmdList() {
  for (const loop of LOOPS) {
    console.log(`${loop.id}\t${loop.label}`);
    console.log(`  goals:  ${loop.goals}`);
    console.log(`  ledger: ${loop.ledger}`);
    for (const g of loop.gates) {
      const tag = g.optionalDocker ? ' (docker)' : '';
      console.log(`  gate:   ${g.label}${tag}`);
    }
  }
}

function cmdCheck(withDocker) {
  const { ok, results } = checkLoops({ withDocker });
  for (const r of results) {
    if (r.skipped) {
      console.log(`[skip] ${r.loop}: ${r.gate}`);
      continue;
    }
    console.log(`[${r.ok ? ' OK ' : 'FAIL'}] ${r.loop}: ${r.gate}`);
    if (!r.ok && r.detail) console.log(r.detail);
  }
  if (!ok) process.exit(1);
  console.log('all loop gates passed');
}

const args = process.argv.slice(2);
const withDocker = args.includes('--with-docker');
const sub = args.find((a) => a !== '--with-docker') ?? 'check';

if (sub === 'list') cmdList();
else if (sub === 'check') cmdCheck(withDocker);
else {
  console.error('Usage: node scripts/self-improving-loops.mjs list|check [--with-docker]');
  process.exit(2);
}
