/**
 * Unit Test Suite for Foundry VTT Module Manifest, Package & Toolchain (Milestone 1)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODULE_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(MODULE_ROOT, '../..');

import { validateManifest, buildZipBuffer, packageRelease } from '../scripts/package-release.mjs';
import { logger, MODULE_ID, MODULE_TITLE } from '../src/utils/logger.js';
import { api } from '../src/module.js';

describe('Milestone 1: Foundry Module Architecture & Manifest Verification', () => {
  let manifest;
  let pkg;

  beforeAll(() => {
    const manifestPath = path.join(MODULE_ROOT, 'module.json');
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const pkgPath = path.join(MODULE_ROOT, 'package.json');
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  });

  describe('1. Authoritative module.json Manifest Verification', () => {
    it('has valid identity and metadata', () => {
      expect(manifest.id).toBe('foundry-ttrpg-vault');
      expect(manifest.title).toBe('TTRPG Vault: Compendium & Automation Bridge');
      expect(manifest.description).toContain('TTRPG Vault');
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(manifest.license).toBe('MIT');
      expect(manifest.authors).toBeInstanceOf(Array);
      expect(manifest.authors.length).toBeGreaterThan(0);
      expect(manifest.url).toBeTruthy();
      expect(manifest.manifest).toBeTruthy();
      expect(manifest.download).toBeTruthy();
    });

    it('strictly satisfies Foundry v11 and v12+ compatibility specifications', () => {
      expect(manifest.compatibility).toBeDefined();
      expect(manifest.compatibility.minimum).toBe('11.315');
      expect(manifest.compatibility.verified).toBe('12.331');
      expect(manifest.compatibility.maximum).toBe('13');

      // Numeric boundary checks
      const minMajor = parseFloat(manifest.compatibility.minimum);
      const verMajor = parseFloat(manifest.compatibility.verified);
      expect(minMajor).toBeGreaterThanOrEqual(11.0);
      expect(verMajor).toBeGreaterThanOrEqual(12.0);
    });

    it('strictly OMITS forbidden deprecated legacy fields to prevent v12 startup crashes', () => {
      expect(manifest.minimumCoreVersion).toBeUndefined();
      expect(manifest.compatibleCoreVersion).toBeUndefined();
    });

    it('declares system dependency on official dnd5e system with compatibility range', () => {
      expect(manifest.relationships).toBeDefined();
      expect(manifest.relationships.systems).toBeInstanceOf(Array);
      
      const dnd5eRel = manifest.relationships.systems.find(s => s.id === 'dnd5e');
      expect(dnd5eRel).toBeDefined();
      expect(dnd5eRel.type).toBe('system');
      expect(dnd5eRel.compatibility).toBeDefined();
      expect(dnd5eRel.compatibility.minimum).toBe('3.0.0');
      expect(dnd5eRel.compatibility.verified).toBe('4.1.2');
    });

    it('configures all four required compendium packs with exact document types and system', () => {
      expect(manifest.packs).toBeInstanceOf(Array);
      expect(manifest.packs.length).toBe(4);

      const packsByName = Object.fromEntries(manifest.packs.map(p => [p.name, p]));

      // 1. vault-monsters
      const monsters = packsByName['vault-monsters'];
      expect(monsters).toBeDefined();
      expect(monsters.type).toBe('Actor'); // Must be capitalized
      expect(monsters.system).toBe('dnd5e');
      expect(monsters.path).toBe('packs/vault-monsters');
      expect(monsters.ownership).toEqual({ PLAYER: 'OBSERVER', ASSISTANT: 'OWNER' });
      expect(monsters.flags?.ttrpgVault?.entityType).toBe('monster');

      // 2. vault-spells
      const spells = packsByName['vault-spells'];
      expect(spells).toBeDefined();
      expect(spells.type).toBe('Item'); // Must be capitalized
      expect(spells.system).toBe('dnd5e');
      expect(spells.path).toBe('packs/vault-spells');
      expect(spells.flags?.ttrpgVault?.entityType).toBe('spell');

      // 3. vault-items
      const items = packsByName['vault-items'];
      expect(items).toBeDefined();
      expect(items.type).toBe('Item');
      expect(items.system).toBe('dnd5e');
      expect(items.path).toBe('packs/vault-items');
      expect(items.flags?.ttrpgVault?.entityType).toBe('item');

      // 4. vault-journals
      const journals = packsByName['vault-journals'];
      expect(journals).toBeDefined();
      expect(journals.type).toBe('JournalEntry');
      expect(journals.path).toBe('packs/vault-journals');
      expect(journals.flags?.ttrpgVault?.entityType).toBe('journal');
    });

    it('groups all packs into branded sidebar packFolders with ruby color (#7B1812)', () => {
      expect(manifest.packFolders).toBeInstanceOf(Array);
      expect(manifest.packFolders.length).toBeGreaterThan(0);

      const folder = manifest.packFolders[0];
      expect(folder.name).toBe('TTRPG Vault Compendiums');
      expect(folder.color.toLowerCase()).toBe('#7b1812');
      expect(folder.packs).toEqual([
        'vault-monsters',
        'vault-spells',
        'vault-items',
        'vault-journals'
      ]);
    });

    it('specifies modern esmodules, styles, and languages paths', () => {
      expect(manifest.esmodules).toEqual(['dist/module.mjs']);
      expect(manifest.styles).toEqual(['styles/vault-bridge.css']);
      expect(manifest.languages).toBeInstanceOf(Array);
      expect(manifest.languages[0].lang).toBe('en');
      expect(manifest.languages[0].path).toBe('languages/en.json');

      // Legacy scripts array must be absent
      expect(manifest.scripts).toBeUndefined();
    });

    it('references existing filesystem assets and valid localization', () => {
      // Stylesheet exists
      const stylePath = path.join(MODULE_ROOT, manifest.styles[0]);
      expect(fs.existsSync(stylePath)).toBe(true);
      expect(fs.readFileSync(stylePath, 'utf8').length).toBeGreaterThan(50);

      // Language file exists and has valid JSON
      const langPath = path.join(MODULE_ROOT, manifest.languages[0].path);
      expect(fs.existsSync(langPath)).toBe(true);
      const langContent = JSON.parse(fs.readFileSync(langPath, 'utf8'));
      expect(langContent.VAULT).toBeDefined();
      expect(langContent.VAULT.Title).toBeTruthy();
      expect(langContent.VAULT.Settings).toBeDefined();
      expect(langContent.VAULT.Dialog).toBeDefined();

      // Templates exist
      expect(fs.existsSync(path.join(MODULE_ROOT, 'templates/import-dialog.hbs'))).toBe(true);
      expect(fs.existsSync(path.join(MODULE_ROOT, 'templates/bridge-status.hbs'))).toBe(true);

      // Pack directories exist
      for (const pack of manifest.packs) {
        expect(fs.existsSync(path.join(MODULE_ROOT, pack.path))).toBe(true);
        expect(fs.existsSync(path.join(MODULE_ROOT, 'packs/_source', pack.name))).toBe(true);
      }
    });
  });

  describe('2. Standalone package.json & Zero Parent Binary Dependency', () => {
    it('has standard standalone npm scripts', () => {
      expect(pkg.name).toBe('foundry-ttrpg-vault');
      expect(pkg.type).toBe('module');
      expect(pkg.scripts).toBeDefined();
      expect(pkg.scripts.build).toBe('vite build');
      expect(pkg.scripts.package).toContain('package-release.mjs');
      expect(pkg.scripts.test).toBe('vitest run');
      expect(pkg.scripts.lint).toContain('lint.mjs');
    });

    it('has ZERO runtime dependencies on parent Electron or native binaries', () => {
      const runtimeDeps = Object.keys(pkg.dependencies || {});
      expect(runtimeDeps).not.toContain('better-sqlite3');
      expect(runtimeDeps).not.toContain('electron');
      expect(runtimeDeps).not.toContain('pdfjs-dist');
      expect(runtimeDeps).not.toContain('worker_threads');
    });
  });

  describe('3. Git Submodule Configuration', () => {
    it('configures .gitmodules in the root repository', () => {
      const gitmodulesPath = path.join(REPO_ROOT, '.gitmodules');
      expect(fs.existsSync(gitmodulesPath)).toBe(true);
      const content = fs.readFileSync(gitmodulesPath, 'utf8');
      expect(content).toContain('[submodule "modules/foundry-ttrpg-vault"]');
      expect(content).toContain('path = modules/foundry-ttrpg-vault');
      expect(content).toContain('url = https://github.com/ttrpg-vault/foundry-ttrpg-vault.git');
    });

    it('has dedicated .gitignore in module directory', () => {
      const gitignorePath = path.join(MODULE_ROOT, '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);
      const content = fs.readFileSync(gitignorePath, 'utf8');
      expect(content).toContain('node_modules');
    });
  });

  describe('4. Vite Build Output & Module Entrypoint', () => {
    it('bundles cleanly to dist/module.mjs with source maps', () => {
      const distMjs = path.join(MODULE_ROOT, 'dist/module.mjs');
      expect(fs.existsSync(distMjs)).toBe(true);
      const content = fs.readFileSync(distMjs, 'utf8');
      expect(content.length).toBeGreaterThan(100);
      expect(content).toContain('foundry-ttrpg-vault');
    });

    it('exports public module API and structured logger', () => {
      expect(MODULE_ID).toBe('foundry-ttrpg-vault');
      expect(MODULE_TITLE).toBe('TTRPG Vault');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');

      expect(api).toBeDefined();
      expect(api.version).toBe('1.0.0');
      expect(typeof api.openImportDialog).toBe('function');
    });
  });

  describe('5. Release Packaging Toolchain (scripts/package-release.mjs)', () => {
    it('validates manifests correctly via validateManifest', () => {
      // Valid manifest
      const validResult = validateManifest(manifest);
      expect(validResult.valid).toBe(true);
      expect(validResult.errors).toEqual([]);

      // Invalid manifest: missing compatibility
      const badManifest1 = { ...manifest, compatibility: undefined };
      const res1 = validateManifest(badManifest1);
      expect(res1.valid).toBe(false);
      expect(res1.errors.some(e => e.includes('compatibility'))).toBe(true);

      // Invalid manifest: forbidden legacy field
      const badManifest2 = { ...manifest, minimumCoreVersion: '11' };
      const res2 = validateManifest(badManifest2);
      expect(res2.valid).toBe(false);
      expect(res2.errors.some(e => e.includes('deprecated') || e.includes('forbidden'))).toBe(true);

      // Invalid manifest: missing dnd5e system relationship
      const badManifest3 = { ...manifest, relationships: { systems: [] } };
      const res3 = validateManifest(badManifest3);
      expect(res3.valid).toBe(false);
      expect(res3.errors.some(e => e.includes('dnd5e'))).toBe(true);
    });

    it('generates a valid PKZIP buffer via buildZipBuffer with correct signatures', () => {
      const files = [
        { name: 'test.txt', data: Buffer.from('Hello TTRPG Vault', 'utf8') },
        { name: 'folder/sub.json', data: Buffer.from(JSON.stringify({ hello: 'world' }), 'utf8') }
      ];

      const zipBuf = buildZipBuffer(files);
      expect(zipBuf).toBeInstanceOf(Buffer);
      expect(zipBuf.length).toBeGreaterThan(0);

      // Verify Local File Header signature (0x04034b50)
      expect(zipBuf.readUInt32LE(0)).toBe(0x04034b50);

      // Verify EOCD signature at end (0x06054b50)
      const eocdSig = zipBuf.readUInt32LE(zipBuf.length - 22);
      expect(eocdSig).toBe(0x06054b50);
    });

    it('executes full packageRelease workflow generating foundry-ttrpg-vault.zip', async () => {
      const result = await packageRelease({ rootDir: MODULE_ROOT });
      expect(result.success).toBe(true);
      expect(result.outputPath).toContain('foundry-ttrpg-vault.zip');
      expect(fs.existsSync(result.outputPath)).toBe(true);
      expect(result.totalFiles).toBeGreaterThan(5);
      expect(result.compressedSize).toBeGreaterThan(0);
      expect(result.checksum).toMatch(/^[a-f0-9]{64}$/); // Valid SHA-256

      // Verify zip contains module.json and dist/module.mjs
      const zipContent = fs.readFileSync(result.outputPath);
      const str = zipContent.toString('latin1');
      expect(str).toContain('foundry-ttrpg-vault/module.json');
      expect(str).toContain('foundry-ttrpg-vault/dist/module.mjs');
      expect(str).toContain('foundry-ttrpg-vault/styles/vault-bridge.css');
      expect(str).toContain('foundry-ttrpg-vault/languages/en.json');
    });
  });
});
