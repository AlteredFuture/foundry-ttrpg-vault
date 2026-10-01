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
 * Injects the Vault Import button into the Compendium sidebar directory.
 * Fully compatible with Foundry v11 (jQuery), v12, v13, and v14 (ApplicationV2 / HTMLElement).
 * @param {HTMLElement|jQuery|any} [html]
 */
function injectCompendiumImportButton(html) {
  if (!game?.user?.isGM) return;

  // Resolve target element safely across HTMLElement and jQuery
  let root = null;
  if (html instanceof HTMLElement) {
    root = html;
  } else if (html && html[0] instanceof HTMLElement) {
    root = html[0];
  } else if (typeof html?.get === 'function') {
    root = html.get(0);
  }

  if (!root) {
    root = document.querySelector('#compendium, .compendium-sidebar, [data-tab="compendium"]');
  }
  if (!root) return;

  // Prevent duplicate buttons
  if (root.querySelector('.vault-import-btn')) return;

  const btnContainer = document.createElement('div');
  btnContainer.className = 'header-actions action-buttons flexrow vault-sidebar-actions';
  btnContainer.style.marginTop = '4px';
  btnContainer.style.marginBottom = '4px';

  const btnTitle = game.i18n.localize('VAULT.Dialog.OpenButtonHint') || 'Import to TTRPG Vault';
  const btnLabel = game.i18n.localize('VAULT.Dialog.OpenButton') || 'Vault Import';

  btnContainer.innerHTML = `
    <button class="vault-import-btn" type="button" title="${btnTitle}" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 4px 8px; font-weight: bold;">
      <i class="fas fa-book-sparkles"></i> <span>${btnLabel}</span>
    </button>
  `;

  const btn = btnContainer.querySelector('.vault-import-btn');
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    api.openImportDialog();
  });

  const footer = root.querySelector('.directory-footer');
  const headerActions = root.querySelector('.header-actions');
  const actionButtons = root.querySelector('.action-buttons');

  if (footer) {
    footer.appendChild(btnContainer);
  } else if (headerActions) {
    headerActions.insertAdjacentElement('afterend', btnContainer);
  } else if (actionButtons) {
    actionButtons.insertAdjacentElement('afterend', btnContainer);
  } else {
    root.appendChild(btnContainer);
  }
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
                ui.notifications.warn(game.i18n.localize('VAULT.Notifications.NoFileSelected') || 'Please select a JSON or ZIP file to import.');
                return;
              }

              const progressContainer = el.querySelector('#vault-progress-container');
              const progressFill = el.querySelector('#vault-progress-fill');
              const progressLabel = el.querySelector('#vault-progress-label');
              const submitBtn = el.querySelector('#vault-start-import-btn');

              if (progressContainer) progressContainer.style.display = 'block';
              if (submitBtn) submitBtn.disabled = true;

              try {
                const text = await selectedFile.text();
                const payload = JSON.parse(text);
                ui.notifications.info(`${MODULE_TITLE}: Processing payload...`);
                // Call hook for payload processing
                Hooks.callAll('ttrpgVault.processPayload', payload, {
                  dialog,
                  file: selectedFile
                });
                ui.notifications.info(`${MODULE_TITLE}: Ingestion complete!`);
                dialog.close();
              } catch (err) {
                logger.error('Failed to parse import payload:', err);
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
    // Verify system compatibility
    if (game.system.id !== 'dnd5e') {
      logger.warn(
        `Active system is "${game.system.id}". ${MODULE_TITLE} is engineered and optimized for the official "dnd5e" system.`
      );
    } else {
      logger.info(`Verified dnd5e system version: ${game.system.version}`);
    }

    // Register API
    const module = game.modules.get(MODULE_ID);
    if (module) {
      module.api = api;
    }

    // Attempt injection if compendium sidebar is already mounted
    setTimeout(() => {
      injectCompendiumImportButton();
    }, 250);

    // Call ready hook for extensions
    Hooks.callAll('ttrpgVault.ready', api);
  });

  // 3. Compendium Directory Hooks
  Hooks.on('renderCompendiumDirectory', (app, html, data) => {
    injectCompendiumImportButton(html);
  });

  Hooks.on('renderSidebarTab', (app, html, data) => {
    if (app?.tabName === 'compendium' || app?.id === 'compendium' || html?.id === 'compendium') {
      injectCompendiumImportButton(html);
    }
  });
}

export default api;
