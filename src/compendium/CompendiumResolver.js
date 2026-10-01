/**
 * modules/foundry-ttrpg-vault/src/compendium/CompendiumResolver.js
 * 
 * High-performance SRD compendium indexing, fuzzy name normalization,
 * canonical @UUID resolution, and homebrew fallback generation.
 * Conforms strictly to official Foundry VTT dnd5e models (v11/dnd5e 3.x & v12+/dnd5e 4.x).
 * Follows the Ponytail principle: minimal, robust, zero unnecessary abstractions.
 */

import { logger, MODULE_ID } from '../utils/logger.js';

// ============================================================================
// Constants & Fallback Icons
// ============================================================================

export const CORE_PACKS = Object.freeze({
  SPELLS: 'dnd5e.spells',
  ITEMS: 'dnd5e.items',
  TRADITIONS: 'dnd5e.traditions',
  RULES: 'dnd5e.rules'
});

export const SCHOOL_ICONS = Object.freeze({
  abj: 'icons/magic/defensive/shield-barrier-blue.webp',
  con: 'icons/magic/movement/portal-vortex-purple.webp',
  div: 'icons/magic/perception/eye-tendrils-purple.webp',
  enc: 'icons/magic/control/hypnosis-mesmerism-swirl.webp',
  evo: 'icons/magic/fire/projectile-fireball-smoke-orange.webp',
  ill: 'icons/magic/air/fog-gas-smoke-dense-gray.webp',
  nec: 'icons/magic/death/skull-horned-goat-pentagram-red.webp',
  trs: 'icons/magic/nature/polymorph-wolf-tan.webp'
});

export const DEFAULT_SPELL_ICON = 'icons/svg/d20-highlight.svg';
export const DEFAULT_WEAPON_ICON = 'icons/weapons/swords/sword-guard-steel.webp';
export const DEFAULT_FEAT_ICON = 'icons/svg/book.svg';

// ============================================================================
// Normalization Utilities & ID Generator
// ============================================================================

/**
 * Generates a deterministic 16-character alphanumeric ID from any string seed.
 * Safe across both browser and Node.js environments.
 * @param {string|number} seed
 * @returns {string} 16-character alphanumeric string matching ^[a-zA-Z0-9]{16}$
 */
export function generateDeterministicId(seed) {
  const str = String(seed != null ? seed : 'default-seed');
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch;
    h2 = Math.imul(h2, 0x01000193) + (h1 << 5);
  }
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let out = '';
  let n1 = Math.abs(h1);
  let n2 = Math.abs(h2);
  for (let i = 0; i < 8; i++) {
    out += chars[n1 % chars.length];
    n1 = Math.floor(n1 / chars.length);
    out += chars[n2 % chars.length];
    n2 = Math.floor(n2 / chars.length);
  }
  return (out + '0000000000000000').slice(0, 16);
}

/**
 * Normalizes any string by stripping parentheticals, unicode artifacts, and leading/trailing bullets.
 * Strips perimeter quotation marks while preserving internal apostrophes.
 * @param {string} rawName
 * @returns {string} Cleaned lowercase string
 */
export function cleanCompendiumName(rawName) {
  if (rawName == null) return '';
  let str = String(rawName);

  // 1. Unicode decomposition (normalize accents)
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 2. Punctuation normalization (curly quotes, backticks, guillemets, dashes, non-breaking spaces)
  str = str
    .replace(/[\u2018\u2019\u201A\u201B\u0060]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u00A0/g, ' ');

  // 3. Remove leading bullets, asterisks, and hyphens
  str = str.replace(/^[\s*•\-\u2022\u25E6\u25AA\u25B8]+/g, '');

  // 4. Strip parentheticals: (at will), (3/day), (3rd level), (ritual), (cantrip), etc.
  str = str.replace(/\s*\([^)]*\)/g, '');

  // 5. Strip trailing punctuation
  str = str.replace(/[:;.*]+$/g, '');

  // 6. Strip perimeter quotes and boundary whitespace (single, double, nested)
  str = str.replace(/^[\s'"]+|[\s'"]+$/g, '');

  // 7. Re-strip bullets/asterisks that were enclosed inside quotes (e.g. "*Magic Missile*")
  str = str.replace(/^[\s*•\-\u2022\u25E6\u25AA\u25B8]+/g, '');

  // 8. Re-strip trailing punctuation that was enclosed inside quotes (e.g. "Fireball.")
  str = str.replace(/[:;.*]+$/g, '');

  // 9. Collapse whitespace and trim
  return str.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Formats a valid Foundry Document UUID.
 * @param {string} packCollection e.g. "dnd5e.spells"
 * @param {string} docType e.g. "Item"
 * @param {string} docId 16-character alphanumeric ID
 * @returns {string} Formatted UUID
 */
export function buildCompendiumUuid(packCollection, docType, docId) {
  return `Compendium.${packCollection}.${docType}.${docId}`;
}

/**
 * Returns an appropriate spell school icon.
 * @param {string} school e.g. 'evo', 'abj'
 * @returns {string} Asset path
 */
export function getFallbackSpellIcon(school) {
  return SCHOOL_ICONS[school] || DEFAULT_SPELL_ICON;
}

// ============================================================================
// Fallback Generation for Non-SRD Custom/Homebrew Items
// ============================================================================

/**
 * Synthesizes a valid self-contained embedded spell Document matching official dnd5e schema.
 * @param {string} rawName
 * @param {object} [parsedData={}]
 * @returns {object} Conforming Foundry spell Item data
 */
export function generateSpellFallback(rawName, parsedData = {}) {
  const cleanTitle = String(rawName || 'Custom Spell').replace(/\s*\([^)]*\)/g, '').trim() || 'Custom Spell';
  const level = Number.isInteger(parsedData.level) && parsedData.level >= 0 ? parsedData.level : 1;
  const school = parsedData.school || 'evo';
  const desc = parsedData.description || parsedData.desc || `<p>Custom or homebrew spell: ${cleanTitle}.</p>`;

  const actId = generateDeterministicId(cleanTitle + ':spell:act');

  return {
    name: cleanTitle,
    type: 'spell',
    img: parsedData.img || getFallbackSpellIcon(school),
    system: {
      description: { value: desc },
      level,
      school,
      components: {
        vocal: Boolean(parsedData.components?.vocal ?? true),
        somatic: Boolean(parsedData.components?.somatic ?? true),
        material: Boolean(parsedData.components?.material ?? false),
        ritual: Boolean(parsedData.is_ritual ?? false),
        concentration: Boolean(parsedData.concentration ?? false)
      },
      properties: [
        ...(parsedData.components?.vocal !== false ? ['vocal'] : []),
        ...(parsedData.components?.somatic !== false ? ['somatic'] : []),
        ...(parsedData.components?.material ? ['material'] : []),
        ...(parsedData.concentration ? ['concentration'] : []),
        ...(parsedData.is_ritual ? ['ritual'] : [])
      ],
      activation: {
        type: parsedData.activation?.type || 'action',
        cost: parsedData.activation?.cost || 1,
        condition: ''
      },
      duration: {
        value: parsedData.duration?.value || '',
        units: parsedData.duration?.units || 'inst'
      },
      target: {
        value: parsedData.target?.value || 1,
        units: '',
        type: parsedData.target?.type || 'creature'
      },
      range: {
        value: parsedData.range?.value || 30,
        units: 'ft'
      },
      source: 'TTRPG Vault (Homebrew Fallback)',
      activities: {
        [actId]: {
          _id: actId,
          type: 'utility',
          name: cleanTitle,
          activation: { type: 'action', value: 1, override: false }
        }
      }
    },
    flags: {
      [MODULE_ID]: {
        srdResolved: false,
        isFallback: true,
        originalName: rawName,
        generatedAt: new Date().toISOString()
      }
    }
  };
}

/**
 * Synthesizes a valid self-contained embedded weapon Document with dual-mode 3.x and 4.x models.
 * @param {string} rawName
 * @param {object} [parsedData={}]
 * @returns {object} Conforming Foundry weapon Item data
 */
export function generateWeaponFallback(rawName, parsedData = {}) {
  const cleanTitle = String(rawName || 'Custom Attack').replace(/\s*\([^)]*\)/g, '').trim() || 'Custom Attack';
  const isRanged = Boolean(parsedData.isRanged);
  const actionType = isRanged ? 'rwak' : 'mwak';
  const damageParts = Array.isArray(parsedData.damageParts) && parsedData.damageParts.length > 0
    ? parsedData.damageParts
    : [['1d6', 'bludgeoning']];

  const activityId = generateDeterministicId(cleanTitle + ':act');

  return {
    name: cleanTitle,
    type: 'weapon',
    img: parsedData.img || (isRanged ? 'icons/weapons/bows/shortbow-recurve.webp' : DEFAULT_WEAPON_ICON),
    system: {
      description: { value: parsedData.description || `<p>Custom attack: ${cleanTitle}.</p>` },
      actionType,
      damage: { parts: damageParts },
      source: 'TTRPG Vault (Homebrew Fallback)',
      range: {
        value: isRanged ? (parsedData.range || 80) : 5,
        long: isRanged ? (parsedData.long || 320) : null,
        units: 'ft'
      },
      // Modern dnd5e 4.x Activity Model
      activities: {
        [activityId]: {
          _id: activityId,
          type: 'attack',
          name: cleanTitle,
          actionType,
          activation: { type: 'action', value: 1, override: false },
          attack: {
            ability: '',
            bonus: String(parsedData.attackBonus || ''),
            flat: true,
            critical: { threshold: 20 },
            type: { value: isRanged ? 'ranged' : 'melee', classification: 'weapon' }
          },
          damage: {
            critical: { bonus: '' },
            includeBase: false,
            parts: damageParts.map(([formula, type]) => ({
              number: null,
              denomination: null,
              bonus: formula,
              types: [type || 'bludgeoning'],
              custom: { enabled: true, formula }
            }))
          }
        },
        attackAct: {
          type: 'attack',
          actionType,
          range: { value: isRanged ? (parsedData.range || 80) : 5, long: isRanged ? (parsedData.long || 320) : null, units: 'ft' }
        },
        damageAct: {
          type: 'damage',
          parts: damageParts
        }
      }
    },
    flags: {
      [MODULE_ID]: {
        srdResolved: false,
        isFallback: true,
        originalName: rawName,
        generatedAt: new Date().toISOString()
      }
    }
  };
}

/**
 * Synthesizes a valid self-contained embedded feat Document for monster traits.
 * @param {string} rawName
 * @param {string} [description='']
 * @returns {object} Conforming Foundry feat Item data
 */
export function generateFeatFallback(rawName, description = '') {
  const cleanTitle = String(rawName || 'Special Trait').replace(/\s*\([^)]*\)/g, '').trim() || 'Special Trait';

  return {
    name: cleanTitle,
    type: 'feat',
    img: DEFAULT_FEAT_ICON,
    system: {
      description: { value: description ? `<p>${description}</p>` : `<p>${cleanTitle}</p>` },
      type: { value: 'monster', subtype: '' },
      source: 'TTRPG Vault'
    },
    flags: {
      [MODULE_ID]: {
        srdResolved: false,
        isFallback: true,
        originalName: rawName,
        generatedAt: new Date().toISOString()
      }
    }
  };
}

// ============================================================================
// CompendiumResolver Class
// ============================================================================

export class CompendiumResolver {
  /**
   * @param {object} [options]
   * @param {object} [options.packProvider] Optional mock packs provider for headless tests
   */
  constructor(options = {}) {
    this.packProvider = options.packProvider || null;
    this.indexes = new Map(); // packId -> Map<normalizedName, IndexEntry>
    this.loadingPromises = new Map(); // packId -> Promise<Map<normalizedName, IndexEntry>>
  }

  /**
   * Resolves the active Foundry packs collection safely.
   * @returns {object|null}
   */
  getPacksCollection() {
    if (this.packProvider) return this.packProvider;
    if (typeof game !== 'undefined' && game.packs) return game.packs;
    return null;
  }

  /**
   * Retrieves or builds the inverted index for a given pack ID.
   * Uses single-flight memoization to avoid redundant LevelDB reads.
   * @param {string} packId e.g. "dnd5e.spells"
   * @param {string[]} [fields=[]]
   * @returns {Promise<Map<string, object>>} Inverted Map: normalizedName -> entry
   */
  async getPackIndex(packId, fields = []) {
    if (this.indexes.has(packId)) {
      return this.indexes.get(packId);
    }

    if (this.loadingPromises.has(packId)) {
      return this.loadingPromises.get(packId);
    }

    const loadPromise = (async () => {
      const packs = this.getPacksCollection();
      if (!packs) {
        logger.debug?.(`No compendium packs provider available for "${packId}".`);
        return new Map();
      }

      const pack = packs.get(packId);
      if (!pack) {
        logger.warn?.(`Compendium pack "${packId}" not found in current game instance.`);
        return new Map();
      }

      try {
        await pack.getIndex({ fields });
        const map = new Map();

        const indexEntries = Array.isArray(pack.index)
          ? pack.index
          : (pack.index && typeof pack.index.values === 'function' ? Array.from(pack.index.values()) : []);

        for (const entry of indexEntries) {
          if (!entry || !entry.name) continue;
          const primaryKey = cleanCompendiumName(entry.name);
          map.set(primaryKey, entry);

          // Secondary exact lowercase trimmed index
          const rawKey = String(entry.name).trim().toLowerCase();
          if (rawKey !== primaryKey && !map.has(rawKey)) {
            map.set(rawKey, entry);
          }
        }

        this.indexes.set(packId, map);
        return map;
      } catch (err) {
        logger.error?.(`Failed to build index for pack "${packId}":`, err);
        return new Map();
      } finally {
        this.loadingPromises.delete(packId);
      }
    })();

    this.loadingPromises.set(packId, loadPromise);
    return loadPromise;
  }

  /**
   * Clears in-memory index caches.
   */
  clearCache() {
    this.indexes.clear();
    this.loadingPromises.clear();
  }

  /**
   * Resolves a raw spell name against the core dnd5e.spells compendium.
   * @param {string} rawSpellName
   * @param {object} [options]
   * @returns {Promise<object|null>} Resolved Document data or null
   */
  async resolveSpell(rawSpellName, options = {}) {
    if (!rawSpellName) return null;

    const indexMap = await this.getPackIndex(CORE_PACKS.SPELLS, [
      'name',
      'type',
      'system.level',
      'system.school',
      'system.actionType'
    ]);

    const entry = this._findInMap(indexMap, rawSpellName);
    if (!entry) return null;

    return this._hydrateEntry(CORE_PACKS.SPELLS, entry, rawSpellName);
  }

  /**
   * Resolves a raw equipment/weapon/consumable name against dnd5e.items.
   * @param {string} rawItemName
   * @param {object} [options]
   * @returns {Promise<object|null>}
   */
  async resolveItem(rawItemName, options = {}) {
    if (!rawItemName) return null;

    const indexMap = await this.getPackIndex(CORE_PACKS.ITEMS, [
      'name',
      'type',
      'system.actionType',
      'system.type.value'
    ]);

    let entry = this._findInMap(indexMap, rawItemName);

    // Tier 3: Magic item comma-shift (+1, +2, +3)
    if (!entry) {
      const transformed = this._transformMagicItemName(rawItemName);
      if (transformed) {
        entry = this._findInMap(indexMap, transformed);
      }
    }

    if (!entry) return null;

    return this._hydrateEntry(CORE_PACKS.ITEMS, entry, rawItemName);
  }

  /**
   * Resolves a feature or subclass tradition from dnd5e.traditions.
   * @param {string} rawTraditionName
   * @returns {Promise<object|null>}
   */
  async resolveTradition(rawTraditionName) {
    if (!rawTraditionName) return null;

    const indexMap = await this.getPackIndex(CORE_PACKS.TRADITIONS, ['name', 'type', 'system.identifier']);
    const entry = this._findInMap(indexMap, rawTraditionName);
    if (!entry) return null;

    return this._hydrateEntry(CORE_PACKS.TRADITIONS, entry, rawTraditionName);
  }

  /**
   * Internal multi-tier name lookup in index Map.
   * @private
   */
  _findInMap(indexMap, rawName) {
    if (!indexMap || indexMap.size === 0) return null;

    // 1. Tier 1: Cleaned name lookup
    const cleaned = cleanCompendiumName(rawName);
    if (indexMap.has(cleaned)) return indexMap.get(cleaned);

    // 2. Exact lowercase trim lookup
    const rawLower = String(rawName).trim().toLowerCase();
    if (indexMap.has(rawLower)) return indexMap.get(rawLower);

    return null;
  }

  /**
   * Mutates magic item names: "Shortsword +1" -> "Shortsword, +1" or vice-versa.
   * @private
   */
  _transformMagicItemName(rawName) {
    const cleaned = cleanCompendiumName(rawName);
    const bonusMatch = cleaned.match(/^(.+?)\s*\+(\d+)$/);
    if (bonusMatch) {
      return `${bonusMatch[1].trim()}, +${bonusMatch[2]}`;
    }
    const commaMatch = cleaned.match(/^(.+?),\s*\+(\d+)$/);
    if (commaMatch) {
      return `${commaMatch[1].trim()} +${commaMatch[2]}`;
    }
    return null;
  }

  /**
   * Hydrates an index entry into a full item document data object with provenance flags.
   * @private
   */
  async _hydrateEntry(packId, entry, rawName) {
    const packs = this.getPacksCollection();
    const pack = packs?.get(packId);

    let docData = null;
    const docClass = (packId === CORE_PACKS.RULES) ? 'JournalEntry' : 'Item';
    let docUuid = entry.uuid || buildCompendiumUuid(packId, docClass, entry._id);

    if (pack && typeof pack.getDocument === 'function') {
      try {
        const doc = await pack.getDocument(entry._id);
        if (doc) {
          docData = typeof doc.toObject === 'function' ? doc.toObject() : JSON.parse(JSON.stringify(doc));
          docUuid = doc.uuid || docUuid;
        }
      } catch (err) {
        logger.warn?.(`Failed to get full document "${entry._id}" from pack "${packId}":`, err);
      }
    }

    // If full document was not fetched, synthesize from index metadata
    if (!docData) {
      docData = {
        _id: entry._id,
        name: entry.name,
        type: entry.type || 'Item',
        img: entry.img || (entry.type === 'spell' ? DEFAULT_SPELL_ICON : DEFAULT_WEAPON_ICON),
        system: entry.system ? JSON.parse(JSON.stringify(entry.system)) : {}
      };
    }

    // Attach core & vault provenance flags
    docData.flags = docData.flags || {};
    docData.flags.core = {
      sourceId: docUuid
    };
    docData.flags[MODULE_ID] = {
      sourceCompendium: packId,
      sourceId: entry._id,
      sourceUuid: docUuid,
      srdResolved: true,
      originalName: rawName,
      resolvedAt: new Date().toISOString()
    };

    return docData;
  }
}

// Global Singleton Export
export const compendiumResolver = new CompendiumResolver();
export default compendiumResolver;
