import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** SQLite online backup of registry.db and every tenants/*.db: consistent under live writes, unlike cp. */
export async function backupDataDir(dataDir: string, outDir: string): Promise<{ files: string[] }> {
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) throw new Error(`backup target not empty: ${outDir}`);
  fs.mkdirSync(path.join(outDir, 'tenants'), { recursive: true });
  const jobs = ['registry.db', ...fs.readdirSync(path.join(dataDir, 'tenants'))
    .filter(f => f.endsWith('.db')).map(f => path.join('tenants', f))];
  for (const rel of jobs) {
    const src = new Database(path.join(dataDir, rel), { readonly: true, fileMustExist: true });
    try { await src.backup(path.join(outDir, rel)); } finally { src.close(); }
  }
  // A backup that fails integrity_check is worse than none: fail loudly now, not at restore time.
  for (const rel of jobs) {
    const db = new Database(path.join(outDir, rel), { readonly: true });
    try {
      const r = db.pragma('integrity_check', { simple: true });
      if (r !== 'ok') throw new Error(`backup integrity_check failed for ${rel}: ${r}`);
    } finally { db.close(); }
  }
  return { files: jobs };
}

/** Restore a backup into an empty (or new) data dir. Never overwrites a live one. */
export function restoreBackup(backupDir: string, dataDir: string): void {
  if (!fs.existsSync(path.join(backupDir, 'registry.db'))) throw new Error(`no registry.db in ${backupDir}`);
  if (fs.existsSync(dataDir) && fs.readdirSync(dataDir).length > 0) throw new Error(`data dir not empty: ${dataDir}`);
  fs.mkdirSync(path.join(dataDir, 'tenants'), { recursive: true });
  fs.copyFileSync(path.join(backupDir, 'registry.db'), path.join(dataDir, 'registry.db'));
  for (const f of fs.readdirSync(path.join(backupDir, 'tenants')).filter(f => f.endsWith('.db'))) {
    fs.copyFileSync(path.join(backupDir, 'tenants', f), path.join(dataDir, 'tenants', f));
  }
}
