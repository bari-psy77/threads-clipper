const NOTIF_PREFIX = 'threads-clipper-';
const clickHandlers = new Map();

chrome.notifications.onClicked.addListener((id) => {
  const handler = clickHandlers.get(id);
  if (handler) {
    handler();
    clickHandlers.delete(id);
    chrome.notifications.clear(id);
  }
});

const ICON_URL = chrome.runtime.getURL('icons/icon128.png');

function show({ title, message, onClick }) {
  const id = NOTIF_PREFIX + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: ICON_URL,
    title,
    message,
    requireInteraction: !!onClick,
  });
  if (onClick) clickHandlers.set(id, onClick);
}

export const notify = {
  success(message, opts = {}) {
    show({ title: 'Obsidian에 저장됨', message, onClick: opts.onClick });
  },
  warn(message) {
    show({ title: 'Threads Clipper', message });
  },
  error(message) {
    show({ title: '저장 실패', message });
  },
  duplicate({ folderName, onOpen }) {
    show({
      title: '이미 저장됨',
      message: `${folderName} (클릭하여 열기)`,
      onClick: onOpen,
    });
  },
};
