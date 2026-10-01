/**
 * Structured logger for TTRPG Vault Foundry module.
 */

export const MODULE_ID = 'foundry-ttrpg-vault';
export const MODULE_TITLE = 'TTRPG Vault';

export const logger = {
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
    if (typeof game !== 'undefined' && game.settings?.get?.(MODULE_ID, 'debugMode')) {
      console.debug(`[${MODULE_TITLE}] [DEBUG]`, ...args);
    }
  }
};
