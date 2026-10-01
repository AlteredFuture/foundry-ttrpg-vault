/**
 * TTRPG Vault: Compendium & Automation Bridge
 * Main Module Entry Point for Foundry Virtual Tabletop (v11 & v12+)
 */

import { MODULE_ID, MODULE_TITLE, logger } from './utils/logger.js';
import {
  CompendiumResolver,
  compendiumResolver,
  cleanCompendiumName,
  buildCompendiumUuid,
  generateSpellFallback,
  generateWeaponFallback,
  generateFeatFallback
} from './compendium/CompendiumResolver.js';

export {
  CompendiumResolver,
  compendiumResolver,
  cleanCompendiumName,
  buildCompendiumUuid,
  generateSpellFallback,
  generateWeaponFallback,
  generateFeatFallback
};
function registerSettings() {
  // Desktop WebSocket Bridge Loopback Port
  game.settings.register(MODULE_ID, 'bridgePort', {
    name: 'VAULT.Settings.BridgePort.Name',
    hint: 'VAULT.Settings.BridgePort.Hint',
    scope: 'client',
    config: true,
    type: Number,
    default: 41782,
    range: { min: 1024, max: 65535, step: 1 }
  });

  // Pairing Authentication Token
  game.settings.register(MODULE_ID, 'authToken', {
    name: 'VAULT.Settings.AuthToken.Name',
    hint: 'VAULT.Settings.AuthToken.Hint',
    scope: 'world',
    config: true,
    type: String,
    default: ''
  });

  // Auto Open Document Sheet on Push
  game.settings.register(MODULE_ID, 'autoOpenOnPush', {
    name: 'VAULT.Settings.AutoOpen.Name',
    hint: 'VAULT.Settings.AutoOpen.Hint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true
  });

  // Default Deduplication Strategy
  game.settings.register(MODULE_ID, 'defaultDeduplication', {
    name: 'VAULT.Settings.Deduplication.Name',
    hint: 'VAULT.Settings.Deduplication.Hint',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      update: 'VAULT.Settings.Deduplication.Update',
      skip: 'VAULT.Settings.Deduplication.Skip',
      duplicate: 'VAULT.Settings.Deduplication.Duplicate'
    },
    default: 'update'
  });

  // Enable Midi-QOL & Automation Enhancements
  game.settings.register(MODULE_ID, 'enableMidiAutomation', {
    name: 'VAULT.Settings.MidiAutomation.Name',
    hint: 'VAULT.Settings.MidiAutomation.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  // Debug Logging Mode
  game.settings.register(MODULE_ID, 'debugMode', {
    name: 'VAULT.Settings.DebugMode.Name',
    hint: 'VAULT.Settings.DebugMode.Hint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false
  });
}

/**
 * Preload Handlebars templates for dialogs and status widgets.
 */
async function preloadTemplates() {
  const templatePaths = [
    `modules/${MODULE_ID}/templates/import-dialog.hbs`,
    `modules/${MODULE_ID}/templates/bridge-status.hbs`
  ];
  return loadTemplates(templatePaths);
}

/**
 * Ingests a JSON/ZIP payload of TTRPG Vault entities directly into Foundry VTT compendium packs.
 * Supports Actors (Monsters/NPCs), Items (Weapons/Equipment/Feats), Spells, and Journals.
 * Handles pack unlocking, deterministic deduplication (update/skip/duplicate), and folder taxonomy.
 * 
 * @param {object|Array} payload
 * @param {object} options
 * @param {string} [options.targetPack='auto']
 * @param {string} [options.taxonomy='source']
 * @param {string} [options.deduplication='update']
 * @param {Function} [options.onProgress]
 * @returns {Promise<{ total: number, created: number, updated: number, skipped: number }>}
 */
export async function importPayloadToCompendiums(payload, options = {}) {
  const targetPackOption = options.targetPack || 'auto';
  const taxonomy = options.taxonomy || 'source';
  const deduplication = options.deduplication || 'update';
  const onProgress = options.onProgress || (() => {});

  // 1. Flatten / extract entities from payload
  let entities = [];
  if (Array.isArray(payload)) {
    entities = payload;
  } else if (payload && typeof payload === 'object') {
    // Check if the payload is a single document first.
    // In Foundry, an Actor or Item has a name and either type, system, or pages.
    // It is critical to check this BEFORE checking payload.items, because Actors
    // have an embedded items array (actor.items) representing their weapons/traits!
    const isSingleDoc = Boolean(
      payload.name &&
      (payload.type || payload.system || payload.pages || payload._id)
    );

    if (isSingleDoc) {
      entities = [payload];
    } else if (Array.isArray(payload.successes)) {
      entities = payload.successes;
    } else {
      let foundBundle = false;
      const bundleKeys = ['actors', 'monsters', 'items', 'spells', 'journals', 'entities'];
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
            if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
              entities.push(...val);
            }
          }
        }
      }
    }
  }

  if (entities.length === 0) {
    throw new Error('No valid entity records found in the import payload.');
  }

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const affectedPacks = new Set();

  for (let i = 0; i < entities.length; i++) {
    const rawDoc = entities[i];
    if (!rawDoc || typeof rawDoc !== 'object') continue;

    const percent = Math.round(((i + 1) / entities.length) * 100);
    onProgress({
      current: i + 1,
      total: entities.length,
      name: rawDoc.name || 'Document',
      percent
    });

    // 2. Resolve target compendium pack
    let packName = targetPackOption;
    if (packName === 'auto') {
      const type = String(rawDoc.type || rawDoc.entity_type || rawDoc.entityType || '').toLowerCase();
      if (type === 'npc' || type === 'character' || type === 'monster' || rawDoc.system?.abilities) {
        packName = 'vault-monsters';
      } else if (type === 'spell') {
        packName = 'vault-spells';
      } else if (type === 'journal' || rawDoc.pages) {
        packName = 'vault-journals';
      } else {
        packName = 'vault-items';
      }
    }

    const fullPackId = packName.includes('.') ? packName : `${MODULE_ID}.${packName}`;
    let pack = game.packs.get(fullPackId);
    if (!pack) {
      pack = game.packs.find(
        (p) =>
          p.metadata.name === packName ||
          p.metadata.id === packName ||
          p.metadata.label === packName
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

    // 3. Unlock pack if locked
    if (pack.locked) {
      try {
        await pack.configure({ locked: false });
      } catch (err) {
        logger.warn(`Could not unlock pack ${pack.collection}:`, err);
      }
    }

    // 4. Clone doc data
    const docData = typeof foundry !== 'undefined' && foundry?.utils?.deepClone ? foundry.utils.deepClone(rawDoc) : JSON.parse(JSON.stringify(rawDoc));

    // 4b. Sanitize activities to conform to Foundry dnd5e schema
    const sanitizeActivities = (sys) => {
      if (sys?.activities && typeof sys.activities === 'object') {
        const cleanActs = {};
        for (const [k, v] of Object.entries(sys.activities)) {
          if (v && typeof v === 'object') {
            const actId = v._id || k;
            if (/^[a-zA-Z0-9]{16}$/.test(actId)) {
              v._id = actId;
              cleanActs[actId] = v;
            } else if (k !== 'utilAct' && k !== 'healAct' && k !== 'castAct') {
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

    // 5. Taxonomy Folder Assignment
    if (taxonomy !== 'flat' && pack.folders) {
      let folderName = null;
      if (taxonomy === 'source') {
        folderName = docData.flags?.ttrpgVault?.source || docData.system?.details?.source || 'Source Documents';
      } else if (taxonomy === 'type') {
        folderName = docData.system?.details?.type?.value || docData.type || 'Entities';
      } else if (taxonomy === 'cr') {
        folderName = docData.system?.details?.cr != null ? `CR ${docData.system.details.cr}` : 'CR Unrated';
      }

      if (folderName) {
        let folder = pack.folders.find((f) => f.name.toLowerCase() === folderName.toLowerCase());
        if (!folder && typeof Folder !== 'undefined') {
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

    // 6. Deduplication Check
    const index = await pack.getIndex({ fields: ['name', 'flags'] });
    const sourceId = docData.flags?.ttrpgVault?.sourceId || docData.flags?.ttrpgVault?.source_id;

    let existingEntry = null;
    if (sourceId) {
      existingEntry = index.find(
        (e) => e.flags?.ttrpgVault?.sourceId === sourceId || e.flags?.ttrpgVault?.source_id === sourceId
      );
    }
    if (!existingEntry && docData._id) {
      existingEntry = index.get(docData._id);
    }
    if (!existingEntry && docData.name) {
      existingEntry = index.find(
        (e) => e.name?.trim().toLowerCase() === docData.name.trim().toLowerCase()
      );
    }

    if (existingEntry) {
      if (deduplication === 'skip') {
        skippedCount++;
        continue;
      } else if (deduplication === 'update') {
        const existingDoc = await pack.getDocument(existingEntry._id);
        if (existingDoc) {
          delete docData._id;
          if (Array.isArray(docData.items) && docData.items.length > 0 && typeof existingDoc.deleteEmbeddedDocuments === 'function') {
            const currentItemIds = existingDoc.items ? existingDoc.items.map((i) => i.id) : [];
            if (currentItemIds.length > 0) {
              await existingDoc.deleteEmbeddedDocuments('Item', currentItemIds);
            }
            const itemsToCreate = docData.items;
            delete docData.items;
            await existingDoc.update(docData);
            if (itemsToCreate.length > 0) {
              await existingDoc.createEmbeddedDocuments('Item', itemsToCreate);
            }
          } else {
            await existingDoc.update(docData);
          }
          updatedCount++;
          continue;
        }
      }
    }

    // Clean primary ID if creating or not a 16-character alphanumeric Foundry ID
    if (deduplication === 'duplicate' || !docData._id || !/^[a-zA-Z0-9]{16}$/.test(docData._id)) {
      delete docData._id;
    }

    // Create document in compendium
    await pack.documentClass.create(docData, { pack: pack.collection });
    createdCount++;
  }

  // Refresh all affected packs in UI
  for (const pack of affectedPacks) {
    try {
      await pack.getIndex();
      if (pack.apps) {
        for (const app of Object.values(pack.apps)) app.render(false);
      }
    } catch (e) {}
  }
  ui.compendium?.render(false);

  return {
    total: entities.length,
    created: createdCount,
    updated: updatedCount,
    skipped: skippedCount
  };
}

/**
 * Injects the Vault Import button exclusively into the Compendium sidebar directory footer.
 * Removes any stray buttons incorrectly placed on the sidebar tabs navigation strip.
 */
function injectCompendiumImportButton() {
  if (!game?.user?.isGM) return;

  // 1. Clean up any stray buttons from the sidebar tabs strip
  const strayButtons = document.querySelectorAll(
    '#sidebar-tabs .vault-sidebar-actions, #sidebar-tabs .vault-import-btn, [data-action="tab"][data-tab="compendium"] .vault-sidebar-actions, a[data-tab="compendium"] .vault-sidebar-actions'
  );
  strayButtons.forEach((el) => el.remove());

  // 2. Locate the compendium directory panel
  const compendium = document.querySelector('#compendium');
  if (!compendium) return;

  // 3. Locate or create the directory footer inside the compendium panel
  let footer = compendium.querySelector('.directory-footer');
  if (!footer) {
    footer = document.createElement('footer');
    footer.className = 'directory-footer action-buttons flexcol';
    compendium.appendChild(footer);
  }

  // 4. Avoid duplicate buttons inside the footer
  if (footer.querySelector('.vault-import-btn')) return;

  const btnContainer = document.createElement('div');
  btnContainer.className = 'header-actions action-buttons flexrow vault-sidebar-actions';
  btnContainer.style.width = '100%';
  btnContainer.style.marginTop = '6px';
  btnContainer.style.marginBottom = '6px';

  const btnTitle = game.i18n.localize('VAULT.Dialog.OpenButtonHint') || 'Import to TTRPG Vault';
  const btnLabel = game.i18n.localize('VAULT.Dialog.OpenButton') || 'Import from Vault';

  btnContainer.innerHTML = `
    <button class="vault-import-btn" type="button" title="${btnTitle}" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 10px; font-weight: bold; cursor: pointer;">
      <i class="fas fa-book-sparkles"></i> <span>${btnLabel}</span>
    </button>
  `;

  const btn = btnContainer.querySelector('.vault-import-btn');
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    api.openImportDialog();
  });

  footer.appendChild(btnContainer);
}

/**
 * Interactive Dialog for importing JSON/ZIP Vault packages into Foundry compendiums.
 */
class VaultImportDialog {
  static async show() {
    const templatePath = `modules/${MODULE_ID}/templates/import-dialog.hbs`;
    const content = await renderTemplate(templatePath, {});

    const dialog = new Dialog(
      {
        title: `${MODULE_TITLE} — ${game.i18n.localize('VAULT.Dialog.Title') || 'Import Data'}`,
        content: content,
        buttons: {},
        render: (html) => {
          const el = html instanceof HTMLElement ? html : html[0];
          const fileInput = el.querySelector('#vault-file-picker');
          const dropzone = el.querySelector('#vault-dropzone');
          const preview = el.querySelector('.vault-selected-preview');
          const previewText = el.querySelector('.vault-preview-text');
          const cancelBtn = el.querySelector('#vault-cancel-btn');
          const form = el.querySelector('.vault-import-form');

          if (dropzone && fileInput) {
            dropzone.addEventListener('click', () => fileInput.click());
            dropzone.addEventListener('dragover', (e) => {
              e.preventDefault();
              dropzone.classList.add('dragover');
            });
            dropzone.addEventListener('dragleave', () => {
              dropzone.classList.remove('dragover');
            });
            dropzone.addEventListener('drop', (e) => {
              e.preventDefault();
              dropzone.classList.remove('dragover');
              if (e.dataTransfer.files?.length) {
                fileInput.files = e.dataTransfer.files;
                handleFileSelection(fileInput.files[0]);
              }
            });

            fileInput.addEventListener('change', () => {
              if (fileInput.files?.length) {
                handleFileSelection(fileInput.files[0]);
              }
            });
          }

          function handleFileSelection(file) {
            if (!file) return;
            if (preview && previewText) {
              preview.style.display = 'flex';
              previewText.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
            }
          }

          if (cancelBtn) {
            cancelBtn.addEventListener('click', () => dialog.close());
          }

          if (form) {
            form.addEventListener('submit', async (e) => {
              e.preventDefault();
              const selectedFile = fileInput?.files?.[0];
              if (!selectedFile) {
                ui.notifications.warn(
                  game.i18n.localize('VAULT.Notifications.NoFileSelected') ||
                    'Please select a JSON or ZIP file to import.'
                );
                return;
              }

              const progressContainer = el.querySelector('#vault-progress-container');
              const progressFill = el.querySelector('#vault-progress-fill');
              const progressLabel = el.querySelector('#vault-progress-label');
              const submitBtn = el.querySelector('#vault-start-import-btn');

              if (progressContainer) progressContainer.style.display = 'block';
              if (submitBtn) submitBtn.disabled = true;

              const targetPack = el.querySelector('#vault-target-pack')?.value || 'auto';
              const taxonomy = el.querySelector('#vault-taxonomy')?.value || 'source';
              const deduplication = el.querySelector('#vault-deduplication')?.value || 'update';

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

                Hooks.callAll('ttrpgVault.importComplete', result);
                dialog.close();
              } catch (err) {
                logger.error('Failed to import payload into compendiums:', err);
                ui.notifications.error(`Failed to import: ${err.message}`);
                if (submitBtn) submitBtn.disabled = false;
              }
            });
          }
        },
        default: 'cancel'
      },
      {
        width: 480,
        height: 'auto',
        classes: ['dialog', 'vault-import-dialog']
      }
    );

    dialog.render(true);
    return dialog;
  }
}

/**
 * Public API exposed on game.modules.get('foundry-ttrpg-vault').api
 */
export const api = {
  version: '1.0.0',
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
    logger.info('Opening TTRPG Vault Import Dialog');
    Hooks.callAll('ttrpgVault.openImportDialog');
    return VaultImportDialog.show();
  },
  getPack(packName) {
    return game.packs.get(`${MODULE_ID}.${packName}`);
  }
};

/* -------------------------------------------------- */
/*  Lifecycle Hooks                                   */
/* -------------------------------------------------- */

// 1. Initialization Hook
if (typeof Hooks !== 'undefined') {
  Hooks.once('init', async () => {
    logger.info(`Initializing ${MODULE_TITLE} v1.0.0...`);

    registerSettings();
    await preloadTemplates();

    logger.info(`${MODULE_TITLE} initialized successfully.`);
  });

  // 2. Ready Hook
  Hooks.once('ready', async () => {
    if (game.system.id !== 'dnd5e') {
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

    // Delay slightly to ensure sidebar directories are initialized in DOM
    setTimeout(injectCompendiumImportButton, 350);

    Hooks.callAll('ttrpgVault.ready', api);
  });

  // 3. Compendium Directory Hook
  Hooks.on('renderCompendiumDirectory', () => {
    injectCompendiumImportButton();
  });
}

export default api;
