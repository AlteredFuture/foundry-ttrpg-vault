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
  openImportDialog() {
    logger.info('Opening TTRPG Vault Import Dialog');
    // Hook for M4 import dialog implementation
    Hooks.callAll('ttrpgVault.openImportDialog');
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

    // Call ready hook for extensions
    Hooks.callAll('ttrpgVault.ready', api);
  });

  // 3. Compendium Directory Button Hook
  Hooks.on('renderCompendiumDirectory', (app, html, data) => {
    if (!game.user.isGM) return;

    const buttonHtml = `
      <div class="header-actions action-buttons flexrow vault-sidebar-actions">
        <button class="vault-import-btn" type="button" title="${game.i18n.localize('VAULT.Dialog.OpenButtonHint')}">
          <i class="fas fa-book-sparkles"></i> ${game.i18n.localize('VAULT.Dialog.OpenButton')}
        </button>
      </div>
    `;

    const footer = html.find('.directory-footer');
    if (footer.length) {
      footer.append(buttonHtml);
    } else {
      html.find('.header-actions').after(buttonHtml);
    }

    html.find('.vault-import-btn').on('click', () => {
      api.openImportDialog();
    });
  });
}

export default api;
