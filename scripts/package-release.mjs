#!/usr/bin/env node
/**
 * Release Packaging Script for foundry-ttrpg-vault
 * Bundles the standalone module into a clean, distributable ZIP archive
 * strictly conforming to Foundry VTT package requirements with zero external dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODULE_ROOT = path.resolve(__dirname, '..');

/**
 * Creates a valid PKZIP Buffer in pure JavaScript using Node built-in zlib.
 * @param {Array<{ name: string, data: Buffer, date?: Date }>} files
 * @returns {Buffer}
 */
export function buildZipBuffer(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const fileNameBytes = Buffer.from(file.name.replace(/\\/g, '/'), 'utf8');
    const d = file.date || new Date();
    const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
    const dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

    const uncompressedSize = file.data.length;
    let compressedData;
    let method = 8; // Deflate

    if (uncompressedSize === 0) {
      method = 0;
      compressedData = Buffer.alloc(0);
    } else {
      const deflated = zlib.deflateRawSync(file.data, { level: 9 });
      if (deflated.length < uncompressedSize) {
        compressedData = deflated;
      } else {
        method = 0; // Stored
        compressedData = file.data;
      }
    }

    const compressedSize = compressedData.length;
    const crc = uncompressedSize > 0 ? zlib.crc32(file.data) : 0;

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30 + fileNameBytes.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4);         // Version needed: 2.0
    localHeader.writeUInt16LE(0x0800, 6);     // Flags: UTF-8
    localHeader.writeUInt16LE(method, 8);     // Compression method
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc >>> 0, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(fileNameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);         // Extra field length
    fileNameBytes.copy(localHeader, 30);

    localHeaders.push(localHeader, compressedData);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46 + fileNameBytes.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory header signature
    centralHeader.writeUInt16LE(20, 4);         // Version made by: 2.0
    centralHeader.writeUInt16LE(20, 6);         // Version needed: 2.0
    centralHeader.writeUInt16LE(0x0800, 8);     // Flags: UTF-8
    centralHeader.writeUInt16LE(method, 10);    // Compression method
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc >>> 0, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(fileNameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);         // Extra field length
    centralHeader.writeUInt16LE(0, 32);         // File comment length
    centralHeader.writeUInt16LE(0, 34);         // Disk number start
    centralHeader.writeUInt16LE(0, 36);         // Internal attributes
    centralHeader.writeUInt32LE(0x81a40000, 38); // External attributes (0644)
    centralHeader.writeUInt32LE(offset, 42);    // Relative offset of local header
    fileNameBytes.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);

    offset += localHeader.length + compressedData.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);

  // End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);           // EOCD signature
  eocd.writeUInt16LE(0, 4);                    // Disk number
  eocd.writeUInt16LE(0, 6);                    // Disk where CD starts
  eocd.writeUInt16LE(files.length, 8);         // CD records on this disk
  eocd.writeUInt16LE(files.length, 10);        // Total CD records
  eocd.writeUInt32LE(centralDirSize, 12);      // Size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16);    // Central directory offset
  eocd.writeUInt16LE(0, 20);                   // Comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

/**
 * Validates the module.json manifest structure.
 * @param {object} manifest
 */
export function validateManifest(manifest) {
  const errors = [];

  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push('Manifest missing valid "id" string');
  }
  if (!manifest.title || typeof manifest.title !== 'string') {
    errors.push('Manifest missing valid "title" string');
  }
  if (!manifest.version || !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push('Manifest version must follow semantic versioning (e.g. 1.0.0)');
  }

  // Foundry v11/v12+ compatibility check
  if (!manifest.compatibility || typeof manifest.compatibility !== 'object') {
    errors.push('Manifest missing "compatibility" object');
  } else {
    if (!manifest.compatibility.minimum) {
      errors.push('Manifest compatibility missing "minimum"');
    }
    if (!manifest.compatibility.verified) {
      errors.push('Manifest compatibility missing "verified"');
    }
  }

  // Forbidden legacy fields that crash Foundry v12
  if (manifest.minimumCoreVersion !== undefined) {
    errors.push('Deprecated legacy field "minimumCoreVersion" is strictly forbidden');
  }
  if (manifest.compatibleCoreVersion !== undefined) {
    errors.push('Deprecated legacy field "compatibleCoreVersion" is strictly forbidden');
  }

  // Relationships (must declare dnd5e system relationship)
  if (!manifest.relationships?.systems?.some(s => s.id === 'dnd5e')) {
    errors.push('Manifest relationships must declare "dnd5e" system requirement');
  }

  // Compendium packs
  if (!Array.isArray(manifest.packs) || manifest.packs.length === 0) {
    errors.push('Manifest must define compendium packs');
  } else {
    const requiredPacks = ['vault-monsters', 'vault-spells', 'vault-items', 'vault-journals'];
    for (const req of requiredPacks) {
      if (!manifest.packs.some(p => p.name === req)) {
        errors.push(`Manifest packs missing required pack "${req}"`);
      }
    }
  }

  // ES Modules
  if (!Array.isArray(manifest.esmodules) || manifest.esmodules.length === 0) {
    errors.push('Manifest must define at least one "esmodules" entry');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Collects files recursively from a directory.
 * @param {string} dir
 * @param {string} baseDir
 * @param {string[]} excludes
 * @returns {Array<{ relativePath: string, fullPath: string }>}
 */
function collectFiles(dir, baseDir = dir, excludes = []) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const rel = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (excludes.some(ex => rel === ex || rel.startsWith(ex + '/') || entry.name === ex || rel.split('/').includes(ex))) {
      continue;
    }

    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, baseDir, excludes));
    } else if (entry.isFile()) {
      results.push({ relativePath: rel, fullPath });
    }
  }
  return results;
}

/**
 * Packages the module into a release zip bundle.
 * @param {object} options
 * @returns {Promise<{ success: boolean, outputPath: string, checksum: string, totalFiles: number, uncompressedSize: number, compressedSize: number }>}
 */
export async function packageRelease(options = {}) {
  const rootDir = options.rootDir || MODULE_ROOT;
  const manifestPath = path.join(rootDir, 'module.json');

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`module.json not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Manifest validation failed:\n - ${validation.errors.join('\n - ')}`);
  }

  // Ensure dist bundle exists
  const entrypoint = path.join(rootDir, 'dist', 'module.mjs');
  if (!fs.existsSync(entrypoint)) {
    console.log('[package-release] dist/module.mjs not found. Running build...');
    const { execSync } = await import('node:child_process');
    try {
      execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
    } catch (buildErr) {
      throw new Error(`Build failed while compiling dist/module.mjs: ${buildErr.message}`);
    }
  }

  // Strictly assert entrypoint exists before packaging
  if (!fs.existsSync(entrypoint)) {
    throw new Error(`Module entrypoint not found at ${entrypoint}. Build failed to generate dist/module.mjs.`);
  }

  // Strictly assert all declared esmodules exist
  if (Array.isArray(manifest.esmodules)) {
    for (const esm of manifest.esmodules) {
      const esmPath = path.join(rootDir, esm);
      if (!fs.existsSync(esmPath)) {
        throw new Error(`Declared esmodule "${esm}" does not exist at ${esmPath}`);
      }
    }
  }

  const fileEntries = [];

  // 1. Root metadata files
  const rootFiles = ['module.json', 'README.md', 'LICENSE'];
  for (const rf of rootFiles) {
    const fp = path.join(rootDir, rf);
    if (fs.existsSync(fp)) {
      fileEntries.push({
        name: `${manifest.id}/${rf}`,
        data: fs.readFileSync(fp)
      });
    }
  }

  // 2. Directories to include
  const includeDirs = ['dist', 'styles', 'templates', 'languages', 'packs'];
  for (const dirName of includeDirs) {
    const dirPath = path.join(rootDir, dirName);
    // Exclude packs/_source and LevelDB runtime LOCK/LOG files from distribution zip
    const excludes = dirName === 'packs' ? ['packs/_source', '_source', 'LOCK', 'LOG', 'LOG.old'] : ['LOCK'];
    const collected = collectFiles(dirPath, rootDir, excludes);

    for (const f of collected) {
      fileEntries.push({
        name: `${manifest.id}/${f.relativePath}`,
        data: fs.readFileSync(f.fullPath)
      });
    }
  }

  if (fileEntries.length === 0) {
    throw new Error('No files collected for packaging');
  }

  // Build ZIP buffer
  const zipBuffer = buildZipBuffer(fileEntries);

  // Compute checksum
  const checksum = crypto.createHash('sha256').update(zipBuffer).digest('hex');

  // Destination zip path
  const outputName = `${manifest.id}.zip`;
  const outputPath = path.join(rootDir, outputName);
  fs.writeFileSync(outputPath, zipBuffer);

  const uncompressedSize = fileEntries.reduce((sum, f) => sum + f.data.length, 0);

  return {
    success: true,
    outputPath,
    outputName,
    checksum,
    totalFiles: fileEntries.length,
    uncompressedSize,
    compressedSize: zipBuffer.length
  };
}

// CLI entry point
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  console.log('===[ Packaging Foundry VTT Release Bundle ]===');
  try {
    const result = await packageRelease();
    console.log(`Target:             ${result.outputPath}`);
    console.log(`Files Included:     ${result.totalFiles}`);
    console.log(`Uncompressed Size:  ${(result.uncompressedSize / 1024).toFixed(2)} KB`);
    console.log(`Compressed Size:    ${(result.compressedSize / 1024).toFixed(2)} KB`);
    console.log(`SHA-256 Checksum:   ${result.checksum}`);
    console.log('Package release bundle generated successfully.');
  } catch (err) {
    console.error('Packaging failed:', err.message);
    process.exit(1);
  }
}
