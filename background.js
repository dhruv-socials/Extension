const PAGE = chrome.runtime.getURL("app.html");

// Clicking the toolbar icon opens Job Links as a full tab (or switches to it if already open).
chrome.action.onClicked.addListener(async (tab) => {
  // Remember the page you were on, so you can add it with one click.
  if (tab && tab.url && /^https?:/.test(tab.url)) {
    await chrome.storage.session.set({ lastTab: { url: tab.url, title: tab.title || "" } });
  }
  const existing = await chrome.tabs.query({ url: PAGE });
  if (existing.length) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.windows.update(existing[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: PAGE });
  }
});
