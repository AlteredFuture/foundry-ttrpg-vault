/**
 * modules/foundry-ttrpg-vault/tests/import-payload.test.js
 * 
 * Unit tests verifying importPayloadToCompendiums properly handles:
 * - Single Actors with embedded items (ensuring Actor document is created in vault-monsters)
 * - Single Items & Spells
 * - Multi-collection bundles ({ actors: [], items: [] })
 * - Activity sanitization (removing duplicate alias keys like utilAct)
 * - Deduplication strategies (update, skip, duplicate)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { importPayloadToCompendiums } from '../src/module.js';

describe('importPayloadToCompendiums', () => {
  let mockPacks;

  beforeEach(() => {
    const createMockPack = (packId, docName) => {
      const documents = new Map();
      return {
        collection: packId,
        metadata: { id: packId, name: packId.split('.')[1], type: docName },
        documentName: docName,
        locked: false,
        configure: vi.fn().mockResolvedValue(true),
        getIndex: vi.fn().mockImplementation(async () => {
          const indexMap = new Map();
          for (const [id, doc] of documents) {
            indexMap.set(id, { _id: id, name: doc.name, flags: doc.flags });
          }
          indexMap.find = (fn) => Array.from(indexMap.values()).find(fn);
          return indexMap;
        }),
        getDocument: vi.fn().mockImplementation(async (id) => documents.get(id) || null),
        documentClass: {
          create: vi.fn().mockImplementation(async (data, context) => {
            const id = data._id || 'mockDoc' + Math.random().toString(36).substring(2, 10);
            const doc = {
              _id: id,
              id,
              ...data,
              update: vi.fn().mockImplementation(async (changes) => {
                Object.assign(doc, changes);
                return doc;
              }),
              deleteEmbeddedDocuments: vi.fn().mockResolvedValue([]),
              createEmbeddedDocuments: vi.fn().mockResolvedValue([])
            };
            documents.set(id, doc);
            return doc;
          })
        },
        _docs: documents
      };
    };

    const monstersPack = createMockPack('foundry-ttrpg-vault.vault-monsters', 'Actor');
    const itemsPack = createMockPack('foundry-ttrpg-vault.vault-items', 'Item');
    const spellsPack = createMockPack('foundry-ttrpg-vault.vault-spells', 'Item');
    const journalsPack = createMockPack('foundry-ttrpg-vault.vault-journals', 'JournalEntry');

    mockPacks = new Map([
      ['foundry-ttrpg-vault.vault-monsters', monstersPack],
      ['foundry-ttrpg-vault.vault-items', itemsPack],
      ['foundry-ttrpg-vault.vault-spells', spellsPack],
      ['foundry-ttrpg-vault.vault-journals', journalsPack]
    ]);

    // Setup global game object
    globalThis.game = {
      packs: {
        get: (id) => mockPacks.get(id),
        find: (fn) => Array.from(mockPacks.values()).find(fn)
      }
    };
    globalThis.ui = {
      compendium: { render: vi.fn() }
    };
    globalThis.Folder = {
      create: vi.fn().mockResolvedValue({ id: 'mockFolderId' })
    };
  });

  it('imports a single Actor with embedded items directly into vault-monsters', async () => {
    const actorPayload = {
      name: 'Binangunan',
      type: 'npc',
      system: {
        abilities: { str: { value: 19 } },
        details: { cr: 7 }
      },
      items: [
        {
          name: 'Languages Abyssal',
          type: 'feat',
          system: {
            activities: {
              '3Z7y2xW3zsHRPXfC': { _id: '3Z7y2xW3zsHRPXfC', type: 'utility' },
              utilAct: { _id: '3Z7y2xW3zsHRPXfC', type: 'utility' }
            }
          }
        },
        {
          name: 'Demonic Restoration',
          type: 'feat',
          system: {}
        }
      ]
    };

    const result = await importPayloadToCompendiums(actorPayload, {
      targetPack: 'auto',
      taxonomy: 'flat',
      deduplication: 'update'
    });

    expect(result.created).toBe(1);
    expect(result.total).toBe(1);

    const monstersPack = mockPacks.get('foundry-ttrpg-vault.vault-monsters');
    expect(monstersPack.documentClass.create).toHaveBeenCalledTimes(1);

    const createdActorData = monstersPack.documentClass.create.mock.calls[0][0];
    expect(createdActorData.name).toBe('Binangunan');
    expect(createdActorData.type).toBe('npc');
    expect(createdActorData.items).toHaveLength(2);

    // Verify utilAct alias was sanitized out of activities
    const firstItemActivities = createdActorData.items[0].system.activities;
    expect(firstItemActivities).toBeDefined();
    expect(firstItemActivities['3Z7y2xW3zsHRPXfC']).toBeDefined();
    expect(firstItemActivities['utilAct']).toBeUndefined();

    // Verify items pack received 0 standalone items
    const itemsPack = mockPacks.get('foundry-ttrpg-vault.vault-items');
    expect(itemsPack.documentClass.create).toHaveBeenCalledTimes(0);
  });

  it('imports a multi-collection bundle with both actors and items', async () => {
    const bundlePayload = {
      actors: [
        { name: 'Goblin', type: 'npc', system: { abilities: {} }, items: [] }
      ],
      items: [
        { name: 'Scimitar', type: 'weapon', system: {} }
      ]
    };

    const result = await importPayloadToCompendiums(bundlePayload, {
      targetPack: 'auto',
      taxonomy: 'flat'
    });

    expect(result.total).toBe(2);
    expect(result.created).toBe(2);

    const monstersPack = mockPacks.get('foundry-ttrpg-vault.vault-monsters');
    expect(monstersPack.documentClass.create).toHaveBeenCalledTimes(1);

    const itemsPack = mockPacks.get('foundry-ttrpg-vault.vault-items');
    expect(itemsPack.documentClass.create).toHaveBeenCalledTimes(1);
  });

  it('skips existing documents when deduplication is skip', async () => {
    const monstersPack = mockPacks.get('foundry-ttrpg-vault.vault-monsters');
    monstersPack._docs.set('existing1', {
      _id: 'existing1',
      name: 'Binangunan',
      flags: {}
    });

    const actorPayload = {
      name: 'Binangunan',
      type: 'npc',
      system: {},
      items: []
    };

    const result = await importPayloadToCompendiums(actorPayload, {
      targetPack: 'auto',
      deduplication: 'skip'
    });

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(monstersPack.documentClass.create).not.toHaveBeenCalled();
  });
});
