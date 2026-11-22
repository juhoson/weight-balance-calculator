#!/usr/bin/env node
// Replaces the .htaccess in the old app folder on songer.se (Loopia) with deploy/songer-redirect.htaccess,
// which sends every visit to https://www.flightplanningtool.com. Backs up the live .htaccess first.
// Only three transfers, so it stays well clear of the host's connection-rate firewall.
//
//   (set -a; . ../cellarmate-home/.env; set +a; node scripts/redirect-old-site.mjs)

import { Client } from 'basic-ftp';
import fs from 'node:fs';
import path from 'node:path';

const { FTP_HOST, FTP_USER, FTP_PASSWORD } = process.env;
const REMOTE_DIR = process.env.WB_FTP_REMOTE_DIR ?? '/songer.se/public_html/weight-balance';
if (!FTP_HOST || !FTP_USER || !FTP_PASSWORD) {
  console.error('Set FTP_HOST, FTP_USER and FTP_PASSWORD.');
  process.exit(1);
}

const backupDir = path.join('backups', new Date().toISOString().replace(/[:.]/g, '-') + '-redirect');
const client = new Client();
try {
  await client.access({ host: FTP_HOST, user: FTP_USER, password: FTP_PASSWORD, secure: true });
  await client.cd(REMOTE_DIR);
  console.log(`Connected to ${FTP_HOST}, in ${await client.pwd()}`);
  fs.mkdirSync(backupDir, { recursive: true });
  await client.downloadTo(path.join(backupDir, '.htaccess'), '.htaccess');
  console.log(`Backed up the live .htaccess to ${backupDir}/`);
  await client.uploadFrom('deploy/songer-redirect.htaccess', '.htaccess');
  console.log('Uploaded the redirect .htaccess.');
} finally {
  client.close();
}
