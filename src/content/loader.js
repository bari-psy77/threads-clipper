(async () => {
  try {
    await import(chrome.runtime.getURL('src/content/scrape.js'));
  } catch (e) {
    console.error('[threads-clipper] failed to load scrape.js', e);
  }
})();
