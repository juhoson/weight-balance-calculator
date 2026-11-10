#!/usr/bin/env node
// Deploys build/ to the web host over FTP (FTPS when the server supports it).
//
//   FTP_HOST=... FTP_USER=... FTP_PASSWORD=... npm run deploy
//
// Options:
//   --dry-run        connect and show what would change, change nothing
//   --no-backup      skip downloading the files that are about to be replaced or removed
//   --force          upload every file, even unchanged ones
// Env: WB_FTP_REMOTE_DIR (default /songer.se/public_html/weight-balance), FTP_INSECURE=1 for plain FTP,
//      FTP_DELAY_MS pause between transfers (default 250). The target deliberately isn't FTP_REMOTE_DIR:
//      the FTP account is shared with cellarmate, whose .env sets that to one of its own folders.
//
// The host's firewall blocks IPs that open many connections in a short time, and every FTP list,
// download and upload opens a new data connection. So this script keeps transfers to a minimum:
//
// 1. Reads a manifest of content hashes from the last deploy (MANIFEST below) and uploads only
//    files that are new or changed, or missing on the server. Without a manifest it uploads all.
// 2. Backs up only the live files it is about to overwrite or remove, to backups/<timestamp>/
//    (roll back by uploading that folder's contents back).
// 3. Uploads assets first and index.html last, so the live page never points at missing bundles,
//    then removes remote files that are not part of the new build (old hashed bundles).
// 4. Never publishes files in public/ that aren't tracked in git, and pauses between transfers.

import { Client } from 'basic-ftp';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';

const { FTP_HOST, FTP_USER, FTP_PASSWORD } = process.env;
const REMOTE_DIR = process.env.WB_FTP_REMOTE_DIR ?? '/songer.se/public_html/weight-balance';
const DELAY_MS = Number(process.env.FTP_DELAY_MS ?? 250);
const BUILD_DIR = path.resolve('build');
const MANIFEST = '.deploy-manifest.json';
const DRY_RUN = process.argv.includes('--dry-run');
const NO_BACKUP = process.argv.includes('--no-backup');
const FORCE = process.argv.includes('--force');

if (!FTP_HOST || !FTP_USER || !FTP_PASSWORD) {
  console.error('Set FTP_HOST, FTP_USER and FTP_PASSWORD.');
  process.exit(1);
}
if (!fs.existsSync(path.join(BUILD_DIR, 'index.html'))) {
  console.error('No build/index.html - run npm run build first.');
  process.exit(1);
}
if (process.env.FTP_REMOTE_DIR) {
  console.log(`Ignoring FTP_REMOTE_DIR (${process.env.FTP_REMOTE_DIR}); set WB_FTP_REMOTE_DIR to change the target.`);
}

/**
 * The backend URL from .env.production, which the build bakes into the bundle. A build without it
 * calls /api on the web host and nothing that needs the backend works, so refuse to deploy one.
 */
function checkBackendUrl() {
  const env = fs.existsSync('.env.production') ? fs.readFileSync('.env.production', 'utf8') : '';
  const url = env.match(/^REACT_APP_API_URL=(.+)$/m)?.[1]?.trim();
  if (!url) {
    console.error('No REACT_APP_API_URL in .env.production.');
    process.exit(1);
  }
  const jsDir = path.join(BUILD_DIR, 'static', 'js');
  const bundles = fs.existsSync(jsDir) ? fs.readdirSync(jsDir).filter(f => /^main\..*\.js$/.test(f)) : [];
  if (!bundles.some(f => fs.readFileSync(path.join(jsDir, f), 'utf8').includes(url))) {
    console.error(`build/ doesn't call the backend at ${url} - rebuild with npm run build.`);
    process.exit(1);
  }
}
checkBackendUrl();

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
const localFiles = listLocal(BUILD_DIR).filter(f => {
  if (f === '.DS_Store' || f.endsWith('/.DS_Store') || f === MANIFEST) return false;
  if (publicFiles.has(f) && !tracked.has(f)) {
    console.log(`skip (not tracked in git): public/${f}`);
    return false;
  }
  return true;
});

const hashOf = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(BUILD_DIR, file))).digest('hex');
const manifest = Object.fromEntries(localFiles.map(f => [f, hashOf(f)]));

const client = new Client(60_000);
const remote = file => path.posix.join(REMOTE_DIR, file);
const pause = () => (DELAY_MS > 0 ? sleep(DELAY_MS) : undefined);

async function listRemote(dir, base = dir) {
  const entries = await client.list(dir);
  await pause();
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.' || entry.name === '..') continue;
    const full = path.posix.join(dir, entry.name);
    if (entry.isDirectory) files.push(...await listRemote(full, base));
    else files.push(path.posix.relative(base, full));
  }
  return files;
}

/** The manifest from the last deploy, or null if there is none (or it is unreadable). */
async function readRemoteManifest() {
  const chunks = [];
  const sink = new Writable({ write(chunk, _encoding, done) { chunks.push(chunk); done(); } });
  try {
    await client.downloadTo(sink, remote(MANIFEST));
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  } finally {
    await pause();
  }
}

try {
  await client.access({
    host: FTP_HOST, user: FTP_USER, password: FTP_PASSWORD,
    secure: process.env.FTP_INSECURE ? false : true,
  });
  console.log(`Connected to ${FTP_HOST} (${process.env.FTP_INSECURE ? 'FTP' : 'FTPS'}), target ${REMOTE_DIR}`);

  const listed = await listRemote(REMOTE_DIR);
  const remoteFiles = new Set(listed.filter(f => f !== MANIFEST));
  const previous = !FORCE && listed.includes(MANIFEST) ? await readRemoteManifest() : null;
  if (!previous && !FORCE) console.log('No deploy manifest on the server - uploading everything.');

  const changed = localFiles.filter(f => !previous || !remoteFiles.has(f) || previous[f] !== manifest[f]);
  // index.html last: the live page should only point at the new bundles once they are all there.
  changed.sort((a, b) => (a === 'index.html') - (b === 'index.html'));
  const keep = new Set(localFiles);
  const stale = [...remoteFiles].filter(f => !keep.has(f));
  const unchanged = localFiles.length - changed.length;

  // Back up exactly what this deploy overwrites or removes.
  const toBackUp = [...changed.filter(f => remoteFiles.has(f)), ...stale];
  if (!DRY_RUN && !NO_BACKUP && toBackUp.length) {
    const backupDir = path.resolve('backups', new Date().toISOString().replace(/[:.]/g, '-'));
    for (const file of toBackUp) {
      const target = path.join(backupDir, ...file.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await client.downloadTo(target, remote(file));
      await pause();
    }
    console.log(`Backed up ${toBackUp.length} live files to ${path.relative(process.cwd(), backupDir)}`);
  }

  console.log(`${DRY_RUN ? 'Would upload' : 'Uploading'} ${changed.length} files (${unchanged} unchanged)`);
  const dirsDone = new Set();
  for (const file of changed) {
    if (DRY_RUN) { console.log(`  ${file}`); continue; }
    const dir = path.posix.dirname(file);
    if (!dirsDone.has(dir)) {
      await client.ensureDir(remote(dir));
      dirsDone.add(dir);
    }
    await client.uploadFrom(path.join(BUILD_DIR, file), remote(file));
    await pause();
  }

  console.log(`${DRY_RUN ? 'Would remove' : 'Removing'} ${stale.length} stale files`);
  for (const file of stale) {
    if (DRY_RUN) { console.log(`  ${file}`); continue; }
    await client.remove(remote(file));
  }

  if (!DRY_RUN) {
    // Written last, so an interrupted deploy re-uploads whatever it didn't finish next time.
    await client.uploadFrom(Readable.from(JSON.stringify(manifest, null, 2)), remote(MANIFEST));
  }
  console.log(DRY_RUN ? 'Dry run - nothing changed.' : 'Deployed.');
} catch (error) {
  console.error('Deploy failed:', error.message);
  process.exitCode = 1;
} finally {
  client.close();
}
