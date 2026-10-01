const MODULE_ID = "foundry-ttrpg-vault";
const MODULE_TITLE = "TTRPG Vault";
const logger = {
  info(...args) {
    console.log(`[${MODULE_TITLE}]`, ...args);
  },
  warn(...args) {
    console.warn(`[${MODULE_TITLE}]`, ...args);
  },
  error(...args) {
    console.error(`[${MODULE_TITLE}]`, ...args);
  },
  debug(...args) {
    var _a, _b;
    if (typeof game !== "undefined" && ((_b = (_a = game.settings) == null ? void 0 : _a.get) == null ? void 0 : _b.call(_a, MODULE_ID, "debugMode"))) {
      console.debug(`[${MODULE_TITLE}] [DEBUG]`, ...args);
    }
  }
};
const CORE_PACKS = Object.freeze({
  SPELLS: "dnd5e.spells",
  ITEMS: "dnd5e.items",
  TRADITIONS: "dnd5e.traditions",
  RULES: "dnd5e.rules"
});
const SCHOOL_ICONS = Object.freeze({
  abj: "icons/magic/defensive/shield-barrier-blue.webp",
  con: "icons/magic/movement/portal-vortex-purple.webp",
  div: "icons/magic/perception/eye-tendrils-purple.webp",
  enc: "icons/magic/control/hypnosis-mesmerism-swirl.webp",
  evo: "icons/magic/fire/projectile-fireball-smoke-orange.webp",
  ill: "icons/magic/air/fog-gas-smoke-dense-gray.webp",
  nec: "icons/magic/death/skull-horned-goat-pentagram-red.webp",
  trs: "icons/magic/nature/polymorph-wolf-tan.webp"
});
const DEFAULT_SPELL_ICON = "icons/svg/d20-highlight.svg";
const DEFAULT_WEAPON_ICON = "icons/weapons/swords/sword-guard-steel.webp";
const DEFAULT_FEAT_ICON = "icons/svg/book.svg";
function generateDeterministicId(seed) {
  const str = String(seed != null ? seed : "default-seed");
  let h1 = 2166136261;
  let h2 = 2654435769;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 16777619);
    h2 ^= ch;
    h2 = Math.imul(h2, 16777619) + (h1 << 5);
  }
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let out = "";
  let n1 = Math.abs(h1);
  let n2 = Math.abs(h2);
  for (let i = 0; i < 8; i++) {
    out += chars[n1 % chars.length];
    n1 = Math.floor(n1 / chars.length);
    out += chars[n2 % chars.length];
    n2 = Math.floor(n2 / chars.length);
  }
  return (out + "0000000000000000").slice(0, 16);
}
function cleanCompendiumName(rawName) {
  if (rawName == null) return "";
  let str = String(rawName);
  str = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  str = str.replace(/[\u2018\u2019\u201A\u201B\u0060]/g, "'").replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"').replace(/[\u2013\u2014\u2212]/g, "-").replace(/\u00A0/g, " ");
  str = str.replace(/^[\s*•\-\u2022\u25E6\u25AA\u25B8]+/g, "");
  str = str.replace(/\s*\([^)]*\)/g, "");
  str = str.replace(/[:;.*]+$/g, "");
  str = str.replace(/^[\s'"]+|[\s'"]+$/g, "");
  str = str.replace(/^[\s*•\-\u2022\u25E6\u25AA\u25B8]+/g, "");
  str = str.replace(/[:;.*]+$/g, "");
  return str.replace(/\s+/g, " ").trim().toLowerCase();
}
function buildCompendiumUuid(packCollection, docType, docId) {
  return `Compendium.${packCollection}.${docType}.${docId}`;
}
function getFallbackSpellIcon(school) {
  return SCHOOL_ICONS[school] || DEFAULT_SPELL_ICON;
}
function generateSpellFallback(rawName, parsedData = {}) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
  const cleanTitle = String(rawName || "Custom Spell").replace(/\s*\([^)]*\)/g, "").trim() || "Custom Spell";
  const level = Number.isInteger(parsedData.level) && parsedData.level >= 0 ? parsedData.level : 1;
  const school = parsedData.school || "evo";
  const desc = parsedData.description || parsedData.desc || `<p>Custom or homebrew spell: ${cleanTitle}.</p>`;
  const actId = generateDeterministicId(cleanTitle + ":spell:act");
  return {
    name: cleanTitle,
    type: "spell",
    img: parsedData.img || getFallbackSpellIcon(school),
    system: {
      description: { value: desc },
      level,
      school,
      components: {
        vocal: Boolean(((_a = parsedData.components) == null ? void 0 : _a.vocal) ?? true),
        somatic: Boolean(((_b = parsedData.components) == null ? void 0 : _b.somatic) ?? true),
        material: Boolean(((_c = parsedData.components) == null ? void 0 : _c.material) ?? false),
        ritual: Boolean(parsedData.is_ritual ?? false),
        concentration: Boolean(parsedData.concentration ?? false)
      },
      properties: [
        ...((_d = parsedData.components) == null ? void 0 : _d.vocal) !== false ? ["vocal"] : [],
        ...((_e = parsedData.components) == null ? void 0 : _e.somatic) !== false ? ["somatic"] : [],
        ...((_f = parsedData.components) == null ? void 0 : _f.material) ? ["material"] : [],
        ...parsedData.concentration ? ["concentration"] : [],
        ...parsedData.is_ritual ? ["ritual"] : []
      ],
      activation: {
        type: ((_g = parsedData.activation) == null ? void 0 : _g.type) || "action",
        cost: ((_h = parsedData.activation) == null ? void 0 : _h.cost) || 1,
        condition: ""
      },
      duration: {
        value: ((_i = parsedData.duration) == null ? void 0 : _i.value) || "",
        units: ((_j = parsedData.duration) == null ? void 0 : _j.units) || "inst"
      },
      target: {
        value: ((_k = parsedData.target) == null ? void 0 : _k.value) || 1,
        units: "",
        type: ((_l = parsedData.target) == null ? void 0 : _l.type) || "creature"
      },
      range: {
        value: ((_m = parsedData.range) == null ? void 0 : _m.value) || 30,
        units: "ft"
      },
      source: "TTRPG Vault (Homebrew Fallback)",
      activities: {
        [actId]: {
          _id: actId,
          type: "utility",
          name: cleanTitle,
          activation: { type: "action", value: 1, override: false }
        }
      }
    },
    flags: {
      [MODULE_ID]: {
        srdResolved: false,
        isFallback: true,
        originalName: rawName,
        generatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    }
  };
}
function generateWeaponFallback(rawName, parsedData = {}) {
  const cleanTitle = String(rawName || "Custom Attack").replace(/\s*\([^)]*\)/g, "").trim() || "Custom Attack";
  const isRanged = Boolean(parsedData.isRanged);
  const actionType = isRanged ? "rwak" : "mwak";
  const damageParts = Array.isArray(parsedData.damageParts) && parsedData.damageParts.length > 0 ? parsedData.damageParts : [["1d6", "bludgeoning"]];
  const activityId = generateDeterministicId(cleanTitle + ":act");
  return {
    name: cleanTitle,
    type: "weapon",
    img: parsedData.img || (isRanged ? "icons/weapons/bows/shortbow-recurve.webp" : DEFAULT_WEAPON_ICON),
    system: {
      description: { value: parsedData.description || `<p>Custom attack: ${cleanTitle}.</p>` },
      actionType,
      damage: { parts: damageParts },
      source: "TTRPG Vault (Homebrew Fallback)",
      range: {
        value: isRanged ? parsedData.range || 80 : 5,
        long: isRanged ? parsedData.long || 320 : null,
        units: "ft"
      },
      // Modern dnd5e 4.x Activity Model
      activities: {
        [activityId]: {
          _id: activityId,
          type: "attack",
          name: cleanTitle,
          actionType,
          activation: { type: "action", value: 1, override: false },
          attack: {
            ability: "",
            bonus: String(parsedData.attackBonus || ""),
            flat: true,
            critical: { threshold: 20 },
            type: { value: isRanged ? "ranged" : "melee", classification: "weapon" }
          },
          damage: {
            critical: { bonus: "" },
            includeBase: false,
            parts: damageParts.map(([formula, type]) => ({
              number: null,
              denomination: null,
              bonus: formula,
              types: [type || "bludgeoning"],
              custom: { enabled: true, formula }
            }))
          }
        },
        attackAct: {
          type: "attack",
          actionType,
          range: { value: isRanged ? parsedData.range || 80 : 5, long: isRanged ? parsedData.long || 320 : null, units: "ft" }
        },
        damageAct: {
          type: "damage",
          parts: damageParts
        }
      }
    },
    flags: {
      [MODULE_ID]: {
        srdResolved: false,
        isFallback: true,
        originalName: rawName,
        generatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    }
  };
}
function generateFeatFallback(rawName, description = "") {
  const cleanTitle = String(rawName || "Special Trait").replace(/\s*\([^)]*\)/g, "").trim() || "Special Trait";
  return {
    name: cleanTitle,
    type: "feat",
    img: DEFAULT_FEAT_ICON,
    system: {
      description: { value: description ? `<p>${description}</p>` : `<p>${cleanTitle}</p>` },
      type: { value: "monster", subtype: "" },
      source: "TTRPG Vault"
    },
    flags: {
      [MODULE_ID]: {
        srdResolved: false,
        isFallback: true,
        originalName: rawName,
        generatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    }
  };
}
class CompendiumResolver {
  /**
   * @param {object} [options]
   * @param {object} [options.packProvider] Optional mock packs provider for headless tests
   */
  constructor(options = {}) {
    this.packProvider = options.packProvider || null;
    this.indexes = /* @__PURE__ */ new Map();
    this.loadingPromises = /* @__PURE__ */ new Map();
  }
  /**
   * Resolves the active Foundry packs collection safely.
   * @returns {object|null}
   */
  getPacksCollection() {
    if (this.packProvider) return this.packProvider;
    if (typeof game !== "undefined" && game.packs) return game.packs;
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
      var _a, _b, _c;
      const packs = this.getPacksCollection();
      if (!packs) {
        (_a = logger.debug) == null ? void 0 : _a.call(logger, `No compendium packs provider available for "${packId}".`);
        return /* @__PURE__ */ new Map();
      }
      const pack = packs.get(packId);
      if (!pack) {
        (_b = logger.warn) == null ? void 0 : _b.call(logger, `Compendium pack "${packId}" not found in current game instance.`);
        return /* @__PURE__ */ new Map();
      }
      try {
        await pack.getIndex({ fields });
        const map = /* @__PURE__ */ new Map();
        const indexEntries = Array.isArray(pack.index) ? pack.index : pack.index && typeof pack.index.values === "function" ? Array.from(pack.index.values()) : [];
        for (const entry of indexEntries) {
          if (!entry || !entry.name) continue;
          const primaryKey = cleanCompendiumName(entry.name);
          map.set(primaryKey, entry);
          const rawKey = String(entry.name).trim().toLowerCase();
          if (rawKey !== primaryKey && !map.has(rawKey)) {
            map.set(rawKey, entry);
          }
        }
        this.indexes.set(packId, map);
        return map;
      } catch (err) {
        (_c = logger.error) == null ? void 0 : _c.call(logger, `Failed to build index for pack "${packId}":`, err);
        return /* @__PURE__ */ new Map();
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
      "name",
      "type",
      "system.level",
      "system.school",
      "system.actionType"
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
      "name",
      "type",
      "system.actionType",
      "system.type.value"
    ]);
    let entry = this._findInMap(indexMap, rawItemName);
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
    const indexMap = await this.getPackIndex(CORE_PACKS.TRADITIONS, ["name", "type", "system.identifier"]);
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
    const cleaned = cleanCompendiumName(rawName);
    if (indexMap.has(cleaned)) return indexMap.get(cleaned);
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
    var _a;
    const packs = this.getPacksCollection();
    const pack = packs == null ? void 0 : packs.get(packId);
    let docData = null;
    const docClass = packId === CORE_PACKS.RULES ? "JournalEntry" : "Item";
    let docUuid = entry.uuid || buildCompendiumUuid(packId, docClass, entry._id);
    if (pack && typeof pack.getDocument === "function") {
      try {
        const doc = await pack.getDocument(entry._id);
        if (doc) {
          docData = typeof doc.toObject === "function" ? doc.toObject() : JSON.parse(JSON.stringify(doc));
          docUuid = doc.uuid || docUuid;
        }
      } catch (err) {
        (_a = logger.warn) == null ? void 0 : _a.call(logger, `Failed to get full document "${entry._id}" from pack "${packId}":`, err);
      }
    }
    if (!docData) {
      docData = {
        _id: entry._id,
        name: entry.name,
        type: entry.type || "Item",
        img: entry.img || (entry.type === "spell" ? DEFAULT_SPELL_ICON : DEFAULT_WEAPON_ICON),
        system: entry.system ? JSON.parse(JSON.stringify(entry.system)) : {}
      };
    }
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
      resolvedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return docData;
  }
}
const compendiumResolver = new CompendiumResolver();
function registerSettings() {
  game.settings.register(MODULE_ID, "bridgePort", {
    name: "VAULT.Settings.BridgePort.Name",
    hint: "VAULT.Settings.BridgePort.Hint",
    scope: "client",
    config: true,
    type: Number,
    default: 41782,
    range: { min: 1024, max: 65535, step: 1 }
  });
  game.settings.register(MODULE_ID, "authToken", {
    name: "VAULT.Settings.AuthToken.Name",
    hint: "VAULT.Settings.AuthToken.Hint",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });
  game.settings.register(MODULE_ID, "autoOpenOnPush", {
    name: "VAULT.Settings.AutoOpen.Name",
    hint: "VAULT.Settings.AutoOpen.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(MODULE_ID, "defaultDeduplication", {
    name: "VAULT.Settings.Deduplication.Name",
    hint: "VAULT.Settings.Deduplication.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      update: "VAULT.Settings.Deduplication.Update",
      skip: "VAULT.Settings.Deduplication.Skip",
      duplicate: "VAULT.Settings.Deduplication.Duplicate"
    },
    default: "update"
  });
  game.settings.register(MODULE_ID, "enableMidiAutomation", {
    name: "VAULT.Settings.MidiAutomation.Name",
    hint: "VAULT.Settings.MidiAutomation.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(MODULE_ID, "debugMode", {
    name: "VAULT.Settings.DebugMode.Name",
    hint: "VAULT.Settings.DebugMode.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
}
async function preloadTemplates() {
  const templatePaths = [
    `modules/${MODULE_ID}/templates/import-dialog.hbs`,
    `modules/${MODULE_ID}/templates/bridge-status.hbs`
  ];
  return loadTemplates(templatePaths);
}
async function importPayloadToCompendiums(payload, options = {}) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
  const targetPackOption = options.targetPack || "auto";
  const taxonomy = options.taxonomy || "source";
  const deduplication = options.deduplication || "update";
  const onProgress = options.onProgress || (() => {
  });
  let entities = [];
  if (Array.isArray(payload)) {
    entities = payload;
  } else if (payload && typeof payload === "object") {
    const isSingleDoc = Boolean(
      payload.name && (payload.type || payload.system || payload.pages || payload._id)
    );
    if (isSingleDoc) {
      entities = [payload];
    } else if (Array.isArray(payload.successes)) {
      entities = payload.successes;
    } else {
      let foundBundle = false;
      const bundleKeys = ["actors", "monsters", "items", "spells", "journals", "entities"];
      for (const key of bundleKeys) {
        if (Array.isArray(payload[key])) {
          entities.push(...payload[key]);
          foundBundle = true;
        }
      }
      if (!foundBundle) {
        if (payload.name) {
          entities = [payload];
        } else {
          for (const val of Object.values(payload)) {
            if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
              entities.push(...val);
            }
          }
        }
      }
    }
  }
  if (entities.length === 0) {
    throw new Error("No valid entity records found in the import payload.");
  }
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const affectedPacks = /* @__PURE__ */ new Set();
  for (let i = 0; i < entities.length; i++) {
    const rawDoc = entities[i];
    if (!rawDoc || typeof rawDoc !== "object") continue;
    const percent = Math.round((i + 1) / entities.length * 100);
    onProgress({
      current: i + 1,
      total: entities.length,
      name: rawDoc.name || "Document",
      percent
    });
    let packName = targetPackOption;
    if (packName === "auto") {
      const type = String(rawDoc.type || rawDoc.entity_type || rawDoc.entityType || "").toLowerCase();
      if (type === "npc" || type === "character" || type === "monster" || ((_a = rawDoc.system) == null ? void 0 : _a.abilities)) {
        packName = "vault-monsters";
      } else if (type === "spell") {
        packName = "vault-spells";
      } else if (type === "journal" || rawDoc.pages) {
        packName = "vault-journals";
      } else {
        packName = "vault-items";
      }
    }
    const fullPackId = packName.includes(".") ? packName : `${MODULE_ID}.${packName}`;
    let pack = game.packs.get(fullPackId);
    if (!pack) {
      pack = game.packs.find(
        (p) => p.metadata.name === packName || p.metadata.id === packName || p.metadata.label === packName
      );
    }
    if (!pack) {
      logger.warn(`Pack "${fullPackId}" not found. Falling back to default.`);
      pack = game.packs.get(`${MODULE_ID}.vault-monsters`) || game.packs.get(`${MODULE_ID}.vault-items`);
    }
    if (!pack) {
      throw new Error(`Unable to locate target compendium pack for "${rawDoc.name}".`);
    }
    affectedPacks.add(pack);
    if (pack.locked) {
      try {
        await pack.configure({ locked: false });
      } catch (err) {
        logger.warn(`Could not unlock pack ${pack.collection}:`, err);
      }
    }
    const docData = typeof foundry !== "undefined" && ((_b = foundry == null ? void 0 : foundry.utils) == null ? void 0 : _b.deepClone) ? foundry.utils.deepClone(rawDoc) : JSON.parse(JSON.stringify(rawDoc));
    const sanitizeActivities = (sys) => {
      if ((sys == null ? void 0 : sys.activities) && typeof sys.activities === "object") {
        const cleanActs = {};
        for (const [k, v] of Object.entries(sys.activities)) {
          if (v && typeof v === "object") {
            const actId = v._id || k;
            if (/^[a-zA-Z0-9]{16}$/.test(actId)) {
              v._id = actId;
              cleanActs[actId] = v;
            } else if (k !== "utilAct" && k !== "healAct" && k !== "castAct") {
              cleanActs[k] = v;
            }
          }
        }
        sys.activities = cleanActs;
      }
    };
    sanitizeActivities(docData.system);
    if (Array.isArray(docData.items)) {
      for (const itm of docData.items) {
        if (itm) sanitizeActivities(itm.system);
      }
    }
    if (taxonomy !== "flat" && pack.folders) {
      let folderName = null;
      if (taxonomy === "source") {
        folderName = ((_d = (_c = docData.flags) == null ? void 0 : _c.ttrpgVault) == null ? void 0 : _d.source) || ((_f = (_e = docData.system) == null ? void 0 : _e.details) == null ? void 0 : _f.source) || "Source Documents";
      } else if (taxonomy === "type") {
        folderName = ((_i = (_h = (_g = docData.system) == null ? void 0 : _g.details) == null ? void 0 : _h.type) == null ? void 0 : _i.value) || docData.type || "Entities";
      } else if (taxonomy === "cr") {
        folderName = ((_k = (_j = docData.system) == null ? void 0 : _j.details) == null ? void 0 : _k.cr) != null ? `CR ${docData.system.details.cr}` : "CR Unrated";
      }
      if (folderName) {
        let folder = pack.folders.find((f) => f.name.toLowerCase() === folderName.toLowerCase());
        if (!folder && typeof Folder !== "undefined") {
          try {
            folder = await Folder.create({ name: folderName, type: pack.documentName }, { pack: pack.collection });
          } catch (e) {
            logger.warn(`Could not create folder "${folderName}" in ${pack.collection}:`, e);
          }
        }
        if (folder) {
          docData.folder = folder.id;
        }
      }
    }
    const index = await pack.getIndex({ fields: ["name", "flags"] });
    const sourceId = ((_m = (_l = docData.flags) == null ? void 0 : _l.ttrpgVault) == null ? void 0 : _m.sourceId) || ((_o = (_n = docData.flags) == null ? void 0 : _n.ttrpgVault) == null ? void 0 : _o.source_id);
    let existingEntry = null;
    if (sourceId) {
      existingEntry = index.find(
        (e) => {
          var _a2, _b2, _c2, _d2;
          return ((_b2 = (_a2 = e.flags) == null ? void 0 : _a2.ttrpgVault) == null ? void 0 : _b2.sourceId) === sourceId || ((_d2 = (_c2 = e.flags) == null ? void 0 : _c2.ttrpgVault) == null ? void 0 : _d2.source_id) === sourceId;
        }
      );
    }
    if (!existingEntry && docData._id) {
      existingEntry = index.get(docData._id);
    }
    if (!existingEntry && docData.name) {
      existingEntry = index.find(
        (e) => {
          var _a2;
          return ((_a2 = e.name) == null ? void 0 : _a2.trim().toLowerCase()) === docData.name.trim().toLowerCase();
        }
      );
    }
    if (existingEntry) {
      if (deduplication === "skip") {
        skippedCount++;
        continue;
      } else if (deduplication === "update") {
        const existingDoc = await pack.getDocument(existingEntry._id);
        if (existingDoc) {
          delete docData._id;
          if (Array.isArray(docData.items) && docData.items.length > 0 && typeof existingDoc.deleteEmbeddedDocuments === "function") {
            const currentItemIds = existingDoc.items ? existingDoc.items.map((i2) => i2.id) : [];
            if (currentItemIds.length > 0) {
              await existingDoc.deleteEmbeddedDocuments("Item", currentItemIds);
            }
            const itemsToCreate = docData.items;
            delete docData.items;
            await existingDoc.update(docData);
            if (itemsToCreate.length > 0) {
              await existingDoc.createEmbeddedDocuments("Item", itemsToCreate);
            }
          } else {
            await existingDoc.update(docData);
          }
          updatedCount++;
          continue;
        }
      }
    }
    if (deduplication === "duplicate" || !docData._id || !/^[a-zA-Z0-9]{16}$/.test(docData._id)) {
      delete docData._id;
    }
    await pack.documentClass.create(docData, { pack: pack.collection });
    createdCount++;
  }
  for (const pack of affectedPacks) {
    try {
      await pack.getIndex();
      if (pack.apps) {
        for (const app of Object.values(pack.apps)) app.render(false);
      }
    } catch (e) {
    }
  }
  (_p = ui.compendium) == null ? void 0 : _p.render(false);
  return {
    total: entities.length,
    created: createdCount,
    updated: updatedCount,
    skipped: skippedCount
  };
}
function injectCompendiumImportButton() {
  var _a;
  if (!((_a = game == null ? void 0 : game.user) == null ? void 0 : _a.isGM)) return;
  const strayButtons = document.querySelectorAll(
    '#sidebar-tabs .vault-sidebar-actions, #sidebar-tabs .vault-import-btn, [data-action="tab"][data-tab="compendium"] .vault-sidebar-actions, a[data-tab="compendium"] .vault-sidebar-actions'
  );
  strayButtons.forEach((el) => el.remove());
  const compendium = document.querySelector("#compendium");
  if (!compendium) return;
  let footer = compendium.querySelector(".directory-footer");
  if (!footer) {
    footer = document.createElement("footer");
    footer.className = "directory-footer action-buttons flexcol";
    compendium.appendChild(footer);
  }
  if (footer.querySelector(".vault-import-btn")) return;
  const btnContainer = document.createElement("div");
  btnContainer.className = "header-actions action-buttons flexrow vault-sidebar-actions";
  btnContainer.style.width = "100%";
  btnContainer.style.marginTop = "6px";
  btnContainer.style.marginBottom = "6px";
  const btnTitle = game.i18n.localize("VAULT.Dialog.OpenButtonHint") || "Import to TTRPG Vault";
  const btnLabel = game.i18n.localize("VAULT.Dialog.OpenButton") || "Import from Vault";
  btnContainer.innerHTML = `
    <button class="vault-import-btn" type="button" title="${btnTitle}" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 10px; font-weight: bold; cursor: pointer;">
      <i class="fas fa-book-sparkles"></i> <span>${btnLabel}</span>
    </button>
  `;
  const btn = btnContainer.querySelector(".vault-import-btn");
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    api.openImportDialog();
  });
  footer.appendChild(btnContainer);
}
class VaultImportDialog {
  static async show() {
    const templatePath = `modules/${MODULE_ID}/templates/import-dialog.hbs`;
    const content = await renderTemplate(templatePath, {});
    const dialog = new Dialog(
      {
        title: `${MODULE_TITLE} — ${game.i18n.localize("VAULT.Dialog.Title") || "Import Data"}`,
        content,
        buttons: {},
        render: (html) => {
          const el = html instanceof HTMLElement ? html : html[0];
          const fileInput = el.querySelector("#vault-file-picker");
          const dropzone = el.querySelector("#vault-dropzone");
          const preview = el.querySelector(".vault-selected-preview");
          const previewText = el.querySelector(".vault-preview-text");
          const cancelBtn = el.querySelector("#vault-cancel-btn");
          const form = el.querySelector(".vault-import-form");
          if (dropzone && fileInput) {
            dropzone.addEventListener("click", () => fileInput.click());
            dropzone.addEventListener("dragover", (e) => {
              e.preventDefault();
              dropzone.classList.add("dragover");
            });
            dropzone.addEventListener("dragleave", () => {
              dropzone.classList.remove("dragover");
            });
            dropzone.addEventListener("drop", (e) => {
              var _a;
              e.preventDefault();
              dropzone.classList.remove("dragover");
              if ((_a = e.dataTransfer.files) == null ? void 0 : _a.length) {
                fileInput.files = e.dataTransfer.files;
                handleFileSelection(fileInput.files[0]);
              }
            });
            fileInput.addEventListener("change", () => {
              var _a;
              if ((_a = fileInput.files) == null ? void 0 : _a.length) {
                handleFileSelection(fileInput.files[0]);
              }
            });
          }
          function handleFileSelection(file) {
            if (!file) return;
            if (preview && previewText) {
              preview.style.display = "flex";
              previewText.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
            }
          }
          if (cancelBtn) {
            cancelBtn.addEventListener("click", () => dialog.close());
          }
          if (form) {
            form.addEventListener("submit", async (e) => {
              var _a, _b, _c, _d;
              e.preventDefault();
              const selectedFile = (_a = fileInput == null ? void 0 : fileInput.files) == null ? void 0 : _a[0];
              if (!selectedFile) {
                ui.notifications.warn(
                  game.i18n.localize("VAULT.Notifications.NoFileSelected") || "Please select a JSON or ZIP file to import."
                );
                return;
              }
              const progressContainer = el.querySelector("#vault-progress-container");
              const progressFill = el.querySelector("#vault-progress-fill");
              const progressLabel = el.querySelector("#vault-progress-label");
              const submitBtn = el.querySelector("#vault-start-import-btn");
              if (progressContainer) progressContainer.style.display = "block";
              if (submitBtn) submitBtn.disabled = true;
              const targetPack = ((_b = el.querySelector("#vault-target-pack")) == null ? void 0 : _b.value) || "auto";
              const taxonomy = ((_c = el.querySelector("#vault-taxonomy")) == null ? void 0 : _c.value) || "source";
              const deduplication = ((_d = el.querySelector("#vault-deduplication")) == null ? void 0 : _d.value) || "update";
              try {
                const text = await selectedFile.text();
                const payload = JSON.parse(text);
                ui.notifications.info(`${MODULE_TITLE}: Processing payload...`);
                const result = await importPayloadToCompendiums(payload, {
                  targetPack,
                  taxonomy,
                  deduplication,
                  onProgress: ({ current, total, name, percent }) => {
                    if (progressFill) progressFill.style.width = `${percent}%`;
                    if (progressLabel) progressLabel.textContent = `${percent}% (${current}/${total}: ${name})`;
                  }
                });
                ui.notifications.info(
                  `${MODULE_TITLE}: Successfully imported ${result.created + result.updated} entries (${result.created} created, ${result.updated} updated, ${result.skipped} skipped).`
                );
                Hooks.callAll("ttrpgVault.importComplete", result);
                dialog.close();
              } catch (err) {
                logger.error("Failed to import payload into compendiums:", err);
                ui.notifications.error(`Failed to import: ${err.message}`);
                if (submitBtn) submitBtn.disabled = false;
              }
            });
          }
        },
        default: "cancel"
      },
      {
        width: 480,
        height: "auto",
        classes: ["dialog", "vault-import-dialog"]
      }
    );
    dialog.render(true);
    return dialog;
  }
}
const api = {
  version: "1.0.0",
  logger,
  resolver: compendiumResolver,
  CompendiumResolver,
  cleanCompendiumName,
  generateSpellFallback,
  generateWeaponFallback,
  generateFeatFallback,
  importPayload: importPayloadToCompendiums,
  injectButton: injectCompendiumImportButton,
  openImportDialog() {
    logger.info("Opening TTRPG Vault Import Dialog");
    Hooks.callAll("ttrpgVault.openImportDialog");
    return VaultImportDialog.show();
  },
  getPack(packName) {
    return game.packs.get(`${MODULE_ID}.${packName}`);
  }
};
if (typeof Hooks !== "undefined") {
  Hooks.once("init", async () => {
    logger.info(`Initializing ${MODULE_TITLE} v1.0.0...`);
    registerSettings();
    await preloadTemplates();
    logger.info(`${MODULE_TITLE} initialized successfully.`);
  });
  Hooks.once("ready", async () => {
    if (game.system.id !== "dnd5e") {
      logger.warn(
        `Active system is "${game.system.id}". ${MODULE_TITLE} is engineered and optimized for the official "dnd5e" system.`
      );
    } else {
      logger.info(`Verified dnd5e system version: ${game.system.version}`);
    }
    const module = game.modules.get(MODULE_ID);
    if (module) {
      module.api = api;
    }
    setTimeout(injectCompendiumImportButton, 350);
    Hooks.callAll("ttrpgVault.ready", api);
  });
  Hooks.on("renderCompendiumDirectory", () => {
    injectCompendiumImportButton();
  });
}
export {
  CompendiumResolver,
  api,
  buildCompendiumUuid,
  cleanCompendiumName,
  compendiumResolver,
  api as default,
  generateFeatFallback,
  generateSpellFallback,
  generateWeaponFallback,
  importPayloadToCompendiums
};
//# sourceMappingURL=module.mjs.map
