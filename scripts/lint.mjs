#!/usr/bin/env node
/**
 * Standalone linting script for foundry-ttrpg-vault.
 * Verifies syntax of JS/MJS modules using node --check, JSON structure, and CSS.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODULE_ROOT = path.resolve(__dirname, '..');

let errors = 0;
let checked = 0;

function checkFile(filePath) {
  const ext = path.extname(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  checked++;

  if (ext === '.json') {
    try {
      JSON.parse(content);
    } catch (e) {
      console.error(`[LINT ERROR] Invalid JSON: ${filePath} - ${e.message}`);
      errors++;
    }
  } else if (ext === '.js' || ext === '.mjs') {
    try {
      execFileSync(process.execPath, ['--check', filePath], { stdio: 'pipe' });
    } catch (e) {
      console.error(`[LINT ERROR] Invalid JS syntax: ${filePath} - ${e.stderr?.toString() || e.message}`);
      errors++;
    }
  } else if (ext === '.css') {
    let openBraces = (content.match(/\{/g) || []).length;
    let closeBraces = (content.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      console.error(`[LINT ERROR] Mismatched braces in CSS: ${filePath} (${openBraces} open vs ${closeBraces} close)`);
      errors++;
    }
  }
}

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (['.js', '.mjs', '.json', '.css'].includes(path.extname(entry.name))) {
      checkFile(fullPath);
    }
  }
}

console.log('===[ Linting foundry-ttrpg-vault ]===');
scanDir(MODULE_ROOT);

if (errors > 0) {
  console.error(`\nLinting failed with ${errors} error(s) across ${checked} files.`);
  process.exit(1);
} else {
  console.log(`Linting passed: ${checked} files verified clean.`);
}
