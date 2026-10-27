/* Firefox suspends this event page when idle; session storage survives that. */
(() => {
  const { frameworks, sanitize } = FrameworkLens;
  const queues = new Map();
  function enqueue(tabId, task) {
    const previous = queues.get(tabId) || Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    queues.set(tabId, next);
    next.finally(() => { if (queues.get(tabId) === next) queues.delete(tabId); }).catch(() => {});
    return next;
  }
  const key = tabId => `tab:${tabId}`;
  async function render(tabId, result) {
    const items = result?.frameworks || [];
    const main = items[0];
    const path = main ? `icons/${main.id}${items.length > 1 ? '-' + items.length : ''}.svg` : 'icons/lens.svg';
    await Promise.all([
      browser.action.setIcon({ tabId, path }),
      browser.action.setTitle({ tabId, title: items.length ? `Framework Lens · ${items.map(f => frameworks[f.id].name).join(', ')}` : 'Framework Lens · No framework detected' }),
    ]).catch(() => {});
  }
  async function read(tabId) {
    const saved = (await browser.storage.session.get(key(tabId)))[key(tabId)];
    return saved?.result || { frameworks: [], truncated: false };
  }
  async function scan(tabId) {
    try {
      // Covers pre-existing tabs and restores scripts after extension updates.
      await browser.scripting.executeScript({ target: { tabId }, files: ['src/bridge.js'] });
      await browser.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['src/probe.js'] });
      return { available: true };
    } catch { return { available: false }; }
  }
  browser.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== browser.runtime.id) return;
    if (message?.type === 'report' && sender.tab && sender.frameId === 0) {
      const result = sanitize(message.payload);
      if (!result || typeof message.documentToken !== 'string' || message.documentToken.length > 64) return;
      return enqueue(sender.tab.id, async () => {
        await browser.storage.session.set({ [key(sender.tab.id)]: { result, documentToken: message.documentToken } });
        await render(sender.tab.id, result);
      });
    }
    // Only extension-owned pages can request privileged tab operations.
    if (sender.tab || !sender.url?.startsWith(browser.runtime.getURL(''))) return;
    if (!Number.isInteger(message?.tabId) || message.tabId < 0) return;
    if (message.type === 'get') return enqueue(message.tabId, () => read(message.tabId));
    if (message.type === 'rescan') return scan(message.tabId);
  });
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === 'loading') enqueue(tabId, async () => {
      await browser.storage.session.remove(key(tabId));
      await render(tabId, null);
    });
  });
  browser.tabs.onRemoved.addListener(tabId => enqueue(tabId, () => browser.storage.session.remove(key(tabId))));
  // SPA navigation does not emit a document load. Ask for one bounded scan.
  browser.webNavigation.onHistoryStateUpdated.addListener(details => {
    if (details.frameId === 0) scan(details.tabId);
  }, { url: [{ schemes: ['http', 'https'] }] });
  browser.tabs.onActivated.addListener(({ tabId }) => scan(tabId));
  browser.runtime.onInstalled.addListener(async () => {
    const tabs = await browser.tabs.query({});
    // Sequential injection avoids a CPU spike when restoring many open tabs.
    for (const tab of tabs) if (Number.isInteger(tab.id)) await scan(tab.id);
  });
})();
