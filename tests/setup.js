import { vi, beforeEach } from 'vitest';

const storageData = {};

globalThis.chrome = {
  storage: {
    sync: {
      get: vi.fn(async (keys) => {
        if (Array.isArray(keys)) {
          const out = {};
          for (const k of keys) if (k in storageData) out[k] = storageData[k];
          return out;
        }
        return { ...storageData };
      }),
      set: vi.fn(async (items) => {
        Object.assign(storageData, items);
      }),
      clear: vi.fn(async () => {
        for (const k of Object.keys(storageData)) delete storageData[k];
      }),
    },
  },
  notifications: {
    create: vi.fn(),
    clear: vi.fn(),
    onClicked: { addListener: vi.fn() },
  },
  runtime: {
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    openOptionsPage: vi.fn(),
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
  },
  action: { onClicked: { addListener: vi.fn() } },
  commands: { onCommand: { addListener: vi.fn() } },
};

beforeEach(async () => {
  await chrome.storage.sync.clear();
  vi.clearAllMocks();
});
