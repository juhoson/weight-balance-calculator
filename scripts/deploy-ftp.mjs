#!/usr/bin/env node
// Deploys build/ to the web host over FTP (FTPS when the server supports it).
//
//   FTP_HOST=... FTP_USER=... FTP_PASSWORD=... npm run deploy
//
// Optional: FTP_REMOTE_DIR (default /songer.se/public_html/weight-balance), FTP_INSECURE=1 for plain FTP.
//
// 1. Backs up the live directory to backups/<timestamp>/ (restore by uploading it back).
// 2. Uploads build/, skipping files that come from public/ but are not tracked in git, so
//    documents lying around in public/ are never published by accident.
// 3. Removes remote files that are not part of the new build (old hashed bundles).

import { Client } from 'basic-ftp';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const { FTP_HOST, FTP_USER, FTP_PASSWORD } = process.env;
const REMOTE_DIR = process.env.FTP_REMOTE_DIR ?? '/songer.se/public_html/weight-balance';
const BUILD_DIR = path.resolve('build');
const DRY_RUN = process.argv.includes('--dry-run');

if (!FTP_HOST || !FTP_USER || !FTP_PASSWORD) {
  console.error('Set FTP_HOST, FTP_USER and FTP_PASSWORD.');
  process.exit(1);
}
if (!fs.existsSync(path.join(BUILD_DIR, 'index.html'))) {
  console.error('No build/index.html - run npm run build first.');
  process.exit(1);
}

/** Relative paths of all files under dir. */
function listLocal(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listLocal(full, base) : [path.relative(base, full).split(path.sep).join('/')];
  });
}

// Files under public/ that git doesn't track must not be published.
const tracked = new Set(execFileSync('git', ['ls-files', 'public'], { encoding: 'utf8' })
  .split('\n').filter(Boolean).map(f => f.replace(/^public\//, '')));
const publicFiles = fs.existsSync('public') ? new Set(listLocal('public')) : new Set();
const toUpload = listLocal(BUILD_DIR).filter(f => {
  if (f === '.DS_Store' || f.endsWith('/.DS_Store')) return false;
  if (publicFiles.has(f) && !tracked.has(f)) {
    console.log(`skip (not tracked in git): public/${f}`);
    return false;
  }
  return true;
});

const client = new Client(60_000);

async function listRemote(dir, base = dir) {
  const entries = await client.list(dir);
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.' || entry.name === '..') continue;
    const full = path.posix.join(dir, entry.name);
    if (entry.isDirectory) files.push(...await listRemote(full, base));
    else files.push(path.posix.relative(base, full));
  }
  return files;
}

try {
  await client.access({
    host: FTP_HOST, user: FTP_USER, password: FTP_PASSWORD,
    secure: process.env.FTP_INSECURE ? false : true,
  });
  console.log(`Connected to ${FTP_HOST} (${process.env.FTP_INSECURE ? 'FTP' : 'FTPS'}), target ${REMOTE_DIR}`);

  const remoteBefore = await listRemote(REMOTE_DIR);
  const backupDir = path.resolve('backups', new Date().toISOString().replace(/[:.]/g, '-'));
  if (!DRY_RUN) {
    fs.mkdirSync(backupDir, { recursive: true });
    await client.downloadToDir(backupDir, REMOTE_DIR);
    console.log(`Backed up ${remoteBefore.length} live files to ${path.relative(process.cwd(), backupDir)}`);
  }

  console.log(`${DRY_RUN ? 'Would upload' : 'Uploading'} ${toUpload.length} files`);
  for (const file of toUpload) {
    if (DRY_RUN) continue;
    await client.ensureDir(path.posix.join(REMOTE_DIR, path.posix.dirname(file)));
    await client.uploadFrom(path.join(BUILD_DIR, file), path.posix.join(REMOTE_DIR, file));
  }

  const keep = new Set(toUpload);
  const stale = remoteBefore.filter(f => !keep.has(f));
  console.log(`${DRY_RUN ? 'Would remove' : 'Removing'} ${stale.length} stale files`);
  for (const file of stale) {
    if (DRY_RUN) { console.log(`  ${file}`); continue; }
    await client.remove(path.posix.join(REMOTE_DIR, file));
  }
  console.log(DRY_RUN ? 'Dry run - nothing changed.' : 'Deployed.');
} catch (error) {
  console.error('Deploy failed:', error.message);
  process.exitCode = 1;
} finally {
  client.close();
}
