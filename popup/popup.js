(async () => {
  const { frameworks, evidence } = FrameworkLens;
  const $ = id => document.getElementById(id);
  let tabId;
  let busy = false;
  let available = true;
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  function icon(id) {
    const img = node('img'); img.src = `../icons/${id}.svg`; img.alt = ''; return img;
  }
  function render(result) {
    const items = result.frameworks;
    $('results').replaceChildren();
    $('results').setAttribute('aria-busy', 'false');
    $('count').hidden = !items.length;
    $('count').textContent = String(items.length);
    $('empty').hidden = !!items.length;
    $('method').hidden = !items.length;
    $('signals').replaceChildren();
    $('sampling').hidden = !result.truncated;
    if (!items.length) {
      $('headline').textContent = 'Framework detection';
      $('empty-title').textContent = available ? 'No framework detected' : 'This page is protected';
      $('empty-description').textContent = available ? 'This page may use static HTML, an unsupported framework, or a runtime without detectable signals.' : 'Firefox does not allow extensions to inspect internal pages and some Mozilla websites.';
      return;
    }
    $('headline').textContent = items.length === 1 ? 'Detected framework' : 'Detected frameworks';
    const main = items[0];
    const card = node('section', 'main-card');
    card.style.setProperty('--framework-color', frameworks[main.id].color);
    const head = node('div', 'framework-head');
    const tile = node('div', 'icon-tile'); tile.append(icon(main.id));
    const label = node('div'); label.append(node('h2', 'framework-name', frameworks[main.id].name), node('span', 'main-tag', 'Main framework · estimated'));
    head.append(tile, label);
    const line = node('p', 'evidence-line');
    const markerOnly = main.signals.every(s => s === 'solid-marker');
    line.append(node('span', 'check', '✓'), node('span', '', markerOnly ? 'Hydration marker found' : 'Framework runtime detected'));
    card.append(head, line); $('results').append(card);
    if (items.length > 1) {
      $('results').append(node('h2', 'other-title', 'ADDITIONAL FRAMEWORKS'));
      const list = node('ul', 'other-list');
      for (const item of items.slice(1)) {
        const row = node('li', 'other-row');
        row.append(icon(item.id), node('strong', '', frameworks[item.id].name), node('span', 'other-label', 'Additional'));
        list.append(row);
      }
      $('results').append(list);
    }
    for (const item of items) {
      const li = node('li');
      li.textContent = `${frameworks[item.id].name}: ${item.signals.map(s => evidence[s]).join('; ')}.`;
      $('signals').append(li);
    }
  }
  async function read() {
    if (Number.isInteger(tabId)) render(await browser.runtime.sendMessage({ type: 'get', tabId }));
  }
  async function refresh() {
    if (busy || !Number.isInteger(tabId)) return;
    busy = true; $('refresh').disabled = true;
    try {
      ({ available } = await browser.runtime.sendMessage({ type: 'rescan', tabId }));
      await read();
      // Bounded retries cover idle scanning and the bridge's message coalescing.
      for (const delay of [250, 650, 1000]) {
        await new Promise(resolve => setTimeout(resolve, delay));
        await read();
      }
    } finally { busy = false; $('refresh').disabled = false; }
  }
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[`tab:${tabId}`]) read();
  });
  $('refresh').addEventListener('click', refresh);
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
    // No tabs permission: URL access is limited to the hosts already permitted.
    try { $('domain').textContent = new URL(tab.url).hostname || 'Current page'; } catch { $('domain').textContent = 'Current page'; }
    if (Number.isInteger(tabId)) { await read(); await refresh(); }
    else { available = false; render({ frameworks: [] }); }
  } catch {
    available = false; render({ frameworks: [] });
  }
})();
