/**
 * modules/foundry-ttrpg-vault/tests/compendium-resolver.test.js
 * 
 * Exhaustive unit test suite for CompendiumResolver, name normalization,
 * inverted index Map caching, canonical @UUID resolution, and fallback generation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CompendiumResolver,
  cleanCompendiumName,
  buildCompendiumUuid,
  generateDeterministicId,
  generateSpellFallback,
  generateWeaponFallback,
  generateFeatFallback,
  CORE_PACKS
} from '../src/compendium/CompendiumResolver.js';

// ============================================================================
// Mock Packs Provider Factory
// ============================================================================

function createMockPacksProvider() {
  const spells = [
    {
      _id: '43e5jY0uQ8lB0A3z',
      name: 'Fireball',
      type: 'spell',
      uuid: 'Compendium.dnd5e.spells.Item.43e5jY0uQ8lB0A3z',
      system: { level: 3, school: 'evo', actionType: 'save' }
    },
    {
      _id: '2kL81xU9d7M4e1Zp',
      name: 'Shield',
      type: 'spell',
      uuid: 'Compendium.dnd5e.spells.Item.2kL81xU9d7M4e1Zp',
      system: { level: 1, school: 'abj', actionType: 'utility' }
    },
    {
      _id: '9aB8c7D6e5F4g3H2',
      name: "Tasha's Hideous Laughter",
      type: 'spell',
      uuid: 'Compendium.dnd5e.spells.Item.9aB8c7D6e5F4g3H2',
      system: { level: 1, school: 'enc', actionType: 'save' }
    },
    {
      _id: '7f6e5d4c3b2a1098',
      name: 'Faerie Fire',
      type: 'spell',
      uuid: 'Compendium.dnd5e.spells.Item.7f6e5d4c3b2a1098',
      system: { level: 1, school: 'evo', actionType: 'save' }
    }
  ];

  const items = [
    {
      _id: '5h8g2k4n9m3x7v1q',
      name: 'Scimitar',
      type: 'weapon',
      uuid: 'Compendium.dnd5e.items.Item.5h8g2k4n9m3x7v1q',
      system: { actionType: 'mwak', type: { value: 'simpleM' } }
    },
    {
      _id: '1m8n7v9j4k2x3q5h',
      name: 'Shortsword, +1',
      type: 'weapon',
      uuid: 'Compendium.dnd5e.items.Item.1m8n7v9j4k2x3q5h',
      system: { actionType: 'mwak', type: { value: 'martialM' } }
    },
    {
      _id: '8v7b6n5m4l3k2j1h',
      name: 'Potion of Healing',
      type: 'consumable',
      uuid: 'Compendium.dnd5e.items.Item.8v7b6n5m4l3k2j1h',
      system: { actionType: 'heal' }
    }
  ];

  const traditions = [
    {
      _id: 'tradition0000001',
      name: 'School of Evocation',
      type: 'subclass',
      uuid: 'Compendium.dnd5e.traditions.Item.tradition0000001',
      system: { identifier: 'evocation' }
    }
  ];

  const createPackMock = (collection, docs) => {
    let getIndexCallCount = 0;
    return {
      collection,
      get getIndexCalls() { return getIndexCallCount; },
      async getIndex({ fields = [] } = {}) {
        getIndexCallCount++;
        this.index = docs.map(d => ({
          _id: d._id,
          name: d.name,
          type: d.type,
          uuid: d.uuid,
          system: d.system
        }));
        return this.index;
      },
      async getDocument(id) {
        const found = docs.find(d => d._id === id);
        if (!found) throw new Error(`Document ${id} not found`);
        return {
          ...found,
          toObject: () => JSON.parse(JSON.stringify(found))
        };
      }
    };
  };

  const packMap = new Map([
    [CORE_PACKS.SPELLS, createPackMock(CORE_PACKS.SPELLS, spells)],
    [CORE_PACKS.ITEMS, createPackMock(CORE_PACKS.ITEMS, items)],
    [CORE_PACKS.TRADITIONS, createPackMock(CORE_PACKS.TRADITIONS, traditions)]
  ]);

  return {
    get: (packId) => packMap.get(packId),
    has: (packId) => packMap.has(packId),
    packMap
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe('CompendiumResolver & SRD Resolution Pipeline', () => {
  let mockProvider;
  let resolver;

  beforeEach(() => {
    mockProvider = createMockPacksProvider();
    resolver = new CompendiumResolver({ packProvider: mockProvider });
  });

  // --------------------------------------------------------------------------
  // Suite 1: Statblock Name Normalization
  // --------------------------------------------------------------------------
  describe('Suite 1: Statblock Name Normalization (cleanCompendiumName)', () => {
    it('strips frequency parentheticals: at will, charges, daily limits', () => {
      expect(cleanCompendiumName('Detect Magic (at will)')).toBe('detect magic');
      expect(cleanCompendiumName('Plane Shift (1/day)')).toBe('plane shift');
      expect(cleanCompendiumName('Darkness (3/day)')).toBe('darkness');
      expect(cleanCompendiumName('Fire Breath (Recharge 5-6)')).toBe('fire breath');
    });

    it('strips level, cantrip, ritual, and concentration tags', () => {
      expect(cleanCompendiumName('Counterspell (3rd level)')).toBe('counterspell');
      expect(cleanCompendiumName('Eldritch Blast (cantrip)')).toBe('eldritch blast');
      expect(cleanCompendiumName('Identify (ritual)')).toBe('identify');
      expect(cleanCompendiumName('Bless (concentration)')).toBe('bless');
      expect(cleanCompendiumName('Invisibility (self only)')).toBe('invisibility');
      expect(cleanCompendiumName('Hold Person (DC 15)')).toBe('hold person');
    });

    it('normalizes Unicode curly quotes, grave accents, and typographer quotes', () => {
      expect(cleanCompendiumName('Tasha’s Hideous Laughter')).toBe("tasha's hideous laughter");
      expect(cleanCompendiumName("Melf`s Acid Arrow")).toBe("melf's acid arrow");
      expect(cleanCompendiumName('“Fireball”')).toBe('fireball');
      expect(cleanCompendiumName('‘Mordenkainen’s Sword’')).toBe("mordenkainen's sword");
    });

    it('decomposes accents and diacritics', () => {
      expect(cleanCompendiumName('Faërie Fire')).toBe('faerie fire');
    });

    it('normalizes non-breaking spaces and collapses multiple whitespace', () => {
      expect(cleanCompendiumName('Mage\u00A0Armor')).toBe('mage armor');
      expect(cleanCompendiumName('  Multiple    Whitespace   Words  ')).toBe('multiple whitespace words');
    });

    it('strips leading bullets, hyphens, and trailing punctuation', () => {
      expect(cleanCompendiumName('*Fireball*')).toBe('fireball');
      expect(cleanCompendiumName('• Shield:')).toBe('shield');
      expect(cleanCompendiumName('- Magic Missile;')).toBe('magic missile');
    });

    it('handles null, undefined, and empty inputs gracefully', () => {
      expect(cleanCompendiumName(null)).toBe('');
      expect(cleanCompendiumName(undefined)).toBe('');
      expect(cleanCompendiumName('')).toBe('');
    });
  });

  // --------------------------------------------------------------------------
  // Suite 2: Fast Indexing & Inverted Index Map Caching
  // --------------------------------------------------------------------------
  describe('Suite 2: Fast Indexing & Inverted Index Map', () => {
    it('builds an inverted index Map with O(1) primary and secondary key lookup', async () => {
      const indexMap = await resolver.getPackIndex(CORE_PACKS.SPELLS);
      expect(indexMap.size).toBeGreaterThan(0);
      expect(indexMap.has('fireball')).toBe(true);
      expect(indexMap.has('shield')).toBe(true);

      const entry = indexMap.get('fireball');
      expect(entry._id).toBe('43e5jY0uQ8lB0A3z');
      expect(entry.name).toBe('Fireball');
    });

    it('implements single-flight memoization to avoid redundant pack.getIndex calls', async () => {
      const packMock = mockProvider.get(CORE_PACKS.SPELLS);
      expect(packMock.getIndexCalls).toBe(0);

      // Fire 10 concurrent requests
      const promises = Array.from({ length: 10 }, () => resolver.getPackIndex(CORE_PACKS.SPELLS));
      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      // getIndex was only called exactly once
      expect(packMock.getIndexCalls).toBe(1);
    });

    it('clearCache resets stored index maps and allows fresh load', async () => {
      await resolver.getPackIndex(CORE_PACKS.SPELLS);
      expect(resolver.indexes.size).toBe(1);

      resolver.clearCache();
      expect(resolver.indexes.size).toBe(0);

      const packMock = mockProvider.get(CORE_PACKS.SPELLS);
      await resolver.getPackIndex(CORE_PACKS.SPELLS);
      expect(packMock.getIndexCalls).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 3: Canonical Spell & Item Resolution
  // --------------------------------------------------------------------------
  describe('Suite 3: Canonical Spell & Item Resolution', () => {
    it('resolves standard spell to canonical document with official flags.core.sourceId', async () => {
      const spell = await resolver.resolveSpell('Fireball');
      expect(spell).not.toBeNull();
      expect(spell.name).toBe('Fireball');
      expect(spell.flags.core.sourceId).toBe('Compendium.dnd5e.spells.Item.43e5jY0uQ8lB0A3z');
      expect(spell.flags['foundry-ttrpg-vault'].srdResolved).toBe(true);
      expect(spell.flags['foundry-ttrpg-vault'].sourceCompendium).toBe('dnd5e.spells');
      expect(spell.system.level).toBe(3);
    });

    it('resolves spell with statblock parenthetical frequency annotation', async () => {
      const spell = await resolver.resolveSpell('Shield (at will)');
      expect(spell).not.toBeNull();
      expect(spell.name).toBe('Shield');
      expect(spell.flags.core.sourceId).toContain('Compendium.dnd5e.spells.Item.');
    });

    it('resolves spell with curly Unicode apostrophe', async () => {
      const spell = await resolver.resolveSpell('Tasha’s Hideous Laughter');
      expect(spell).not.toBeNull();
      expect(spell.name).toBe("Tasha's Hideous Laughter");
    });

    it('resolves weapon from dnd5e.items', async () => {
      const weapon = await resolver.resolveItem('Scimitar');
      expect(weapon).not.toBeNull();
      expect(weapon.name).toBe('Scimitar');
      expect(weapon.system.actionType).toBe('mwak');
      expect(weapon.flags.core.sourceId).toBe('Compendium.dnd5e.items.Item.5h8g2k4n9m3x7v1q');
    });

    it('resolves magic item with comma transformation (Shortsword +1 -> Shortsword, +1)', async () => {
      const weapon = await resolver.resolveItem('Shortsword +1');
      expect(weapon).not.toBeNull();
      expect(weapon.name).toBe('Shortsword, +1');
      expect(weapon.flags.core.sourceId).toBe('Compendium.dnd5e.items.Item.1m8n7v9j4k2x3q5h');
    });

    it('resolves subclass tradition from dnd5e.traditions', async () => {
      const tradition = await resolver.resolveTradition('School of Evocation');
      expect(tradition).not.toBeNull();
      expect(tradition.name).toBe('School of Evocation');
      expect(tradition.flags.core.sourceId).toContain('Compendium.dnd5e.traditions.Item.');
    });
  });

  // --------------------------------------------------------------------------
  // Suite 4: Fallback Generation for Non-SRD / Homebrew Items
  // --------------------------------------------------------------------------
  describe('Suite 4: Homebrew Fallback Generation', () => {
    it('returns null when spell is non-SRD, enabling fallback generator', async () => {
      const nonSrd = await resolver.resolveSpell('Eldritch Nova Cannon (Homebrew)');
      expect(nonSrd).toBeNull();
    });

    it('generateSpellFallback constructs compliant spell with isFallback flag', () => {
      const fallback = generateSpellFallback('Eldritch Nova Cannon (4th level)', {
        level: 4,
        school: 'evo',
        description: 'Blasts pure void energy in a 30-ft sphere.'
      });

      expect(fallback.name).toBe('Eldritch Nova Cannon');
      expect(fallback.type).toBe('spell');
      expect(fallback.system.level).toBe(4);
      expect(fallback.system.school).toBe('evo');
      expect(fallback.system.properties).toContain('vocal');
      expect(fallback.flags['foundry-ttrpg-vault'].isFallback).toBe(true);
      expect(fallback.flags['foundry-ttrpg-vault'].srdResolved).toBe(false);
      expect(fallback.system.activities).toBeDefined();
    });

    it('generateWeaponFallback constructs dual-mode attack with 3.x and 4.x activities', () => {
      const fallback = generateWeaponFallback('Venomous Tail Stinger', {
        attackBonus: 7,
        isRanged: false,
        damageParts: [['2d8 + 4', 'piercing'], ['2d6', 'poison']],
        description: 'Melee weapon attack with venom.'
      });

      expect(fallback.name).toBe('Venomous Tail Stinger');
      expect(fallback.type).toBe('weapon');
      expect(fallback.system.actionType).toBe('mwak');
      expect(fallback.system.damage.parts).toHaveLength(2);
      expect(fallback.system.activities.attackAct.type).toBe('attack');
      expect(fallback.system.activities.damageAct.type).toBe('damage');
      expect(fallback.flags['foundry-ttrpg-vault'].isFallback).toBe(true);
    });

    it('generateFeatFallback constructs monster special trait', () => {
      const feat = generateFeatFallback('Cannibal Vigor (3/Day)', 'Regains hit points on kill.');
      expect(feat.name).toBe('Cannibal Vigor');
      expect(feat.type).toBe('feat');
      expect(feat.system.type.value).toBe('monster');
      expect(feat.flags['foundry-ttrpg-vault'].isFallback).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 5: Error Resilience & Graceful Degradation
  // --------------------------------------------------------------------------
  describe('Suite 5: Error Resilience & Edge Cases', () => {
    it('returns null on null, undefined, or empty item queries', async () => {
      expect(await resolver.resolveSpell(null)).toBeNull();
      expect(await resolver.resolveSpell(undefined)).toBeNull();
      expect(await resolver.resolveSpell('')).toBeNull();
      expect(await resolver.resolveItem(null)).toBeNull();
      expect(await resolver.resolveTradition(null)).toBeNull();
    });

    it('returns empty index Map safely when pack provider is null (headless environment without mocks)', async () => {
      const headlessResolver = new CompendiumResolver();
      const indexMap = await headlessResolver.getPackIndex('dnd5e.spells');
      expect(indexMap.size).toBe(0);
      expect(await headlessResolver.resolveSpell('Fireball')).toBeNull();
    });

    it('returns empty index Map safely when requested pack does not exist', async () => {
      const indexMap = await resolver.getPackIndex('nonexistent.pack');
      expect(indexMap.size).toBe(0);
    });

    it('handles pack.getDocument exceptions gracefully by synthesizing from index entry', async () => {
      const corruptPack = {
        collection: 'dnd5e.spells',
        async getIndex() {
          this.index = [{ _id: 'corrupt1', name: 'Corrupt Spell', type: 'spell' }];
          return this.index;
        },
        async getDocument() {
          throw new Error('LevelDB disk read error');
        }
      };

      const customProvider = {
        get: () => corruptPack,
        has: () => true
      };

      const testResolver = new CompendiumResolver({ packProvider: customProvider });
      const doc = await testResolver.resolveSpell('Corrupt Spell');
      expect(doc).not.toBeNull();
      expect(doc.name).toBe('Corrupt Spell');
      expect(doc.flags.core.sourceId).toContain('Compendium.dnd5e.spells.Item.corrupt1');
    });
  });

  // --------------------------------------------------------------------------
  // Suite 6: Deterministic ID Generator
  // --------------------------------------------------------------------------
  describe('Suite 6: Deterministic 16-Char ID Generator', () => {
    it('produces exactly 16-character alphanumeric strings matching ^[a-zA-Z0-9]{16}$', () => {
      const id1 = generateDeterministicId('actor:goblin-1');
      const id2 = generateDeterministicId('spell:fireball');
      const id3 = generateDeterministicId(12345);

      expect(id1).toMatch(/^[a-zA-Z0-9]{16}$/);
      expect(id2).toMatch(/^[a-zA-Z0-9]{16}$/);
      expect(id3).toMatch(/^[a-zA-Z0-9]{16}$/);
    });

    it('is purely deterministic across multiple calls with same seed', () => {
      const idA = generateDeterministicId('constant-seed');
      const idB = generateDeterministicId('constant-seed');
      expect(idA).toBe(idB);
    });

    it('generates different IDs for different seeds', () => {
      const id1 = generateDeterministicId('seed-alpha');
      const id2 = generateDeterministicId('seed-beta');
      expect(id1).not.toBe(id2);
    });
  });
});
