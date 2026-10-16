#!/usr/bin/env node
import * as os from 'node:os';
import * as path from 'node:path';
import { startHostedSyncServer } from './server.js';
import { backupDataDir, restoreBackup } from './backup.js';

async function main(): Promise<void> {
  const dataDir = process.env.TIM_SYNC_DATA_DIR ?? path.join(os.homedir(), '.tim', 'sync-server');
  const [cmd, target] = process.argv.slice(2);
  if (cmd === 'backup' || cmd === 'restore') {
    if (!target) throw new Error(`usage: tim-sync-server ${cmd} <${cmd === 'backup' ? 'out' : 'backup'}-dir>`);
    if (cmd === 'backup') console.log(`backed up ${(await backupDataDir(dataDir, target)).files.length} dbs to ${target}`);
    else { restoreBackup(target, dataDir); console.log(`restored ${target} into ${dataDir}`); }
    return;
  }
  const port = parseInt(process.env.TIM_SYNC_PORT ?? cmd ?? '3100', 10);
  const host = process.env.TIM_SYNC_HOST ?? '127.0.0.1';
  const handle = await startHostedSyncServer({ port, host, dataDir });
  console.log(`TIM hosted sync server on http://${host}:${handle.port} (data: ${dataDir})`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
