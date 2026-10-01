# TTRPG Vault: Compendium & Automation Bridge for Foundry VTT

A standalone Foundry Virtual Tabletop module providing compendium management and automation bridge pipelines connecting the TTRPG Vault desktop application with Foundry VTT worlds, with primary focus on the official `dnd5e` system.

## Compatibility
- **Foundry VTT**: v11 (min 11.315) through v12+ (verified 12.331)
- **Game System**: D&D 5th Edition (`dnd5e`) v3.0.0 through v4.1.2+

## Features
- **Packs Provisioning**: Pre-configured compendium packs (`vault-monsters`, `vault-spells`, `vault-items`, `vault-journals`) categorized under a branded folder.
- **Dual Ingestion**: Drag-and-drop JSON/ZIP imports via in-Foundry UI and 1-click live bridge pushing from TTRPG Vault desktop app.
- **Deterministic Deduplication**: In-place compendium updates via stable source tracking identifiers (`flags.ttrpgVault.sourceId`).
- **Zero Parent Runtime Dependencies**: Pure browser client code for Foundry VTT.

## Building and Packaging
```bash
# Build module bundle
npm run build

# Run unit tests
npm test

# Run linter
npm run lint

# Package release zip
npm run package
```
