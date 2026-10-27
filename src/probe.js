/* Read-only page probe. See docs/detection.md for upstream source references. */
(() => {
  const KEY = '__frameworkLensProbeV1';
  // The guard also permits on-demand injection into tabs open before installation.
  if (window[KEY]) { window[KEY](); return; }
  const CHANNEL = 'framework-lens:v1';
  const MAX_NODES = 4000;
  const events = new Set();
  let scheduled = false;
  let running = false;
  let rerun = false;
  let last = '';
  let lastScan = 0;
  let observer;
  let mutationTimer;
  let observationEnd = 0;
  const attempt = fn => { try { return fn(); } catch { return undefined; } };
  const object = value => value !== null && typeof value === 'object';
  const versions = value => Array.isArray(value) && value.some(v => typeof v === 'string' && /^\d+\./.test(v));
  const vnode = value => object(value) && ('__k' in value || '_children' in value) && ('__e' in value || '_dom' in value);
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    const run = () => { scheduled = false; scan(); };
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 400 });
    else setTimeout(run, 32);
  }
  function scan() {
    if (running) { rerun = true; return; }
    running = true;
    lastScan = performance.now();
    const found = new Map();
    const add = (id, signal) => {
      if (!found.has(id)) found.set(id, { id, signals: new Set(), coverage: 0 });
      found.get(id).signals.add(signal);
    };
    // An extension's empty hook is not evidence that a framework is present.
    attempt(() => {
      const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      hook?.renderers?.forEach(renderer => {
        const name = renderer?.rendererPackageName;
        if (typeof name === 'string' && /^react-(dom|art|three|native)/.test(name)) add('react', 'react-renderer');
        if (typeof name === 'string' && /preact/i.test(name)) add('preact', 'preact-renderer');
      });
    });
    attempt(() => {
      const hook = window.__VUE_DEVTOOLS_GLOBAL_HOOK__;
      if (hook?.apps?.length || hook?.appRecords?.length) add('vue', 'vue-hook');
      if (window.__VUE__ === true) add('vue', 'vue-runtime');
    });
    attempt(() => {
      if (window.__svelte?.v instanceof Set && [...window.__svelte.v].some(v => /^\d+$/.test(String(v)))) add('svelte', 'svelte-runtime');
    });
    attempt(() => { if (window.__PREACT_DEVTOOLS__?.renderers?.size > 0) add('preact', 'preact-renderer'); });
    attempt(() => {
      if (window.Solid$$ || window.SolidDevtools$$) add('solid', 'solid-devtools');
      if (window._$HY?.completed instanceof WeakSet) add('solid', 'solid-hydration');
      if (document._$DX_DELEGATE instanceof Set && document._$DX_DELEGATE.size > 0) add('solid', 'solid-events');
    });
    attempt(() => { if (typeof window.Alpine?.version === 'string' && typeof window.Alpine?.start === 'function') add('alpine', 'alpine-runtime'); });
    attempt(() => { if (versions(window.litHtmlVersions) || versions(window.litElementVersions)) add('lit', 'lit-runtime'); });
    if (events.has('svelte')) add('svelte', 'svelte-event');

    // An iterative walk bounds work and never materializes the whole document.
    // Ownership is inherited from actual mounted roots, including open shadows.
    const stack = document.documentElement ? [{ node: document.documentElement, owners: [] }] : [];
    let visited = 0;
    let activeTime = 0;
    function chunk() {
      const chunkStart = performance.now();
      while (stack.length && visited < MAX_NODES) {
        const { node, owners: parentOwners } = stack.pop();
        visited++;
        const owners = new Set(parentOwners);
        const mark = (id, signal) => { add(id, signal); owners.add(id); };
        attempt(() => {
          // These unminified prefixes are the ones React DOM gives host nodes.
          const keys = Object.keys(node);
          if (keys.some(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$') || k.startsWith('__reactContainer$')) || node._reactRootContainer) mark('react', 'react-fiber');
          if (node.__vue_app__ || node.__vue__ || node.__vueParentComponent) mark('vue', 'vue-app');
          if (node.__svelte_meta) mark('svelte', 'svelte-node');
          if (vnode(node.__k) || vnode(node._children) || object(node.__preactattr_)) mark('preact', 'preact-root');
          if (node.hasAttribute('data-hk')) mark('solid', 'solid-marker');
          if (Array.isArray(node._x_dataStack) || node.__x?.$data) mark('alpine', 'alpine-node');
          if (node._$litPart$ || node.renderRoot && node.constructor?.['_$litElement$']) mark('lit', 'lit-node');
        });
        for (const id of owners) if (found.has(id)) found.get(id).coverage++;
        // Keep only the next sibling, so even a million siblings cannot make
        // the walk allocate a million stack entries before reaching its cap.
        if (node.nextElementSibling) stack.push({ node: node.nextElementSibling, owners: parentOwners });
        if (node.firstElementChild) stack.push({ node: node.firstElementChild, owners: [...owners] });
        if (node.shadowRoot) {
          if (node.shadowRoot._$litPart$) { add('lit', 'lit-node'); owners.add('lit'); }
          if (node.shadowRoot.firstElementChild) stack.push({ node: node.shadowRoot.firstElementChild, owners: [...owners] });
        }
        if (performance.now() - chunkStart >= 4) break;
      }
      activeTime += performance.now() - chunkStart;
      if (stack.length && visited < MAX_NODES && activeTime < 24) {
        if ('requestIdleCallback' in window) window.requestIdleCallback(chunk, { timeout: 400 });
        else setTimeout(chunk, 0);
        return;
      }
      const payload = { frameworks: [...found.values()].map(f => ({ ...f, signals: [...f.signals] })), truncated: stack.length > 0 };
      const serialized = JSON.stringify(payload);
      if (serialized !== last) {
        last = serialized;
        window.postMessage({ channel: CHANNEL, type: 'result', payload }, '*');
      }
      running = false;
      if (rerun) { rerun = false; schedule(); }
    }
    chunk();
  }
  function observeBriefly(duration = 8000) {
    observationEnd = Date.now() + duration;
    if (observer) return;
    // Only inspect whether a batch contains elements; never scan in a mutation callback.
    observer = new MutationObserver(records => {
      if (!records.some(r => r.addedNodes.length) || mutationTimer) return;
      // Keep a trailing check: a script element may be added just before its
      // asynchronously loaded framework mounts in a second mutation batch.
      const delay = Math.max(0, 700 - (performance.now() - lastScan));
      mutationTimer = setTimeout(() => { mutationTimer = undefined; schedule(); }, delay);
    });
    observer.observe(document, { childList: true, subtree: true });
    function stop() {
      const remaining = observationEnd - Date.now();
      if (remaining > 0) { setTimeout(stop, remaining); return; }
      observer.disconnect(); observer = undefined;
    }
    setTimeout(stop, duration);
  }
  function request() { last = ''; schedule(); }
  function rescan() { request(); observeBriefly(2000); }
  attempt(() => { Object.defineProperty(window, KEY, { value: rescan, configurable: true }); });
  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.channel !== CHANNEL || event.data.type !== 'scan') return;
    request(); observeBriefly(2000);
  });
  document.addEventListener('SvelteRegisterComponent', () => {
    if (!events.has('svelte')) { events.add('svelte'); schedule(); }
  });
  document.addEventListener('alpine:initialized', schedule);
  document.addEventListener('DOMContentLoaded', () => { schedule(); observeBriefly(); }, { once: true });
  window.addEventListener('load', schedule, { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted) { request(); observeBriefly(2000); } });
  window.addEventListener('popstate', () => { request(); observeBriefly(2000); });
  // One scan after hydration has settled; no repeating timer or lifetime observer.
  setTimeout(schedule, 1500);
  setTimeout(schedule, 8000);
  if (document.readyState !== 'loading') { schedule(); observeBriefly(); }
})();
