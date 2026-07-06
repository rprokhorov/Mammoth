#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const type = process.argv[2];
if (!['patch', 'minor', 'major'].includes(type)) {
  console.error('Usage: node scripts/bump-version.js [patch|minor|major]');
  process.exit(1);
}

const pkgPath = resolve(root, 'package.json');
const tauriPath = resolve(root, 'src-tauri/tauri.conf.json');
const cargoPath = resolve(root, 'src-tauri/Cargo.toml');
const cargoLockPath = resolve(root, 'src-tauri/Cargo.lock');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const tauri = JSON.parse(readFileSync(tauriPath, 'utf8'));

const [major, minor, patch] = pkg.version.split('.').map(Number);

let newVersion;
if (type === 'major') newVersion = `${major + 1}.0.0`;
else if (type === 'minor') newVersion = `${major}.${minor + 1}.0`;
else newVersion = `${major}.${minor}.${patch + 1}`;

pkg.version = newVersion;
tauri.version = newVersion;

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');

// Keep the Rust crate version in sync (first `version = ...` in [package])
const cargo = readFileSync(cargoPath, 'utf8');
writeFileSync(cargoPath, cargo.replace(/^version = ".*"$/m, `version = "${newVersion}"`));

// Update the app's own entry in Cargo.lock so builds don't rewrite it
const cargoLock = readFileSync(cargoLockPath, 'utf8');
writeFileSync(
  cargoLockPath,
  cargoLock.replace(
    /(name = "mattermost-desktop"\nversion = ")[^"]*(")/,
    `$1${newVersion}$2`
  )
);

console.log(`Bumped version to ${newVersion}`);

execSync(`git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock`, { cwd: root, stdio: 'inherit' });
execSync(`git commit -m "chore: bump version to ${newVersion}"`, { cwd: root, stdio: 'inherit' });
execSync(`git tag v${newVersion}`, { cwd: root, stdio: 'inherit' });

console.log(`Tagged v${newVersion}`);
