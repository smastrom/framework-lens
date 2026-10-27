import { test, expect } from 'bun:test';
import { JSDOM } from 'jsdom';
import { loadCatalog } from './load-catalog.mjs';
const probe = await Bun.file('src/probe.js').text();
// Inject browser globals directly; no separate VM or JavaScript runtime.
const runProbe = new Function('window', 'document', 'MutationObserver', 'performance', 'setTimeout', probe);
async function detect(setup = () => {}, html = '<div id="app"><p>Hello</p></div>') {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { url: 'https://fixture.test/' });
  const win = dom.window;
  try {
    setup(win);
    const result = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Probe did not report')), 1500);
      win.addEventListener('message', event => { if (event.data?.type === 'result') { clearTimeout(timeout); resolve(event.data.payload); } });
    });
    runProbe(win, win.document, win.MutationObserver, win.performance, win.setTimeout.bind(win));
    return JSON.parse(JSON.stringify(await result));
  } finally { win.close(); }
}
const ids = result => result.frameworks.map(f => f.id).sort();
test('framework names, stylesheet hashes, uninitialized directives and empty devtools hooks are not evidence', async () => {
  const result = await detect(w => {
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { renderers: new w.Map() };
    w.__PREACT_DEVTOOLS__ = { renderers: new w.Map() };
    w.__VUE_DEVTOOLS_GLOBAL_HOOK__ = {};
  }, '<div x-data="{}" class="svelte-abc">React Vue Solid Lit Alpine Preact</div>');
  expect(ids(result)).toEqual([]);
});
test('React mounted DOM remains detectable without devtools hooks', async () => {
  const result = await detect(w => { w.document.getElementById('app')['__reactFiber$abc'] = {}; });
  expect(ids(result)).toEqual(['react']); expect(result.frameworks[0].coverage).toBe(2);
});
test('all seven runtime protocols are recognized together without mutating hooks', async () => {
  let reactHook;
  const result = await detect(w => {
    reactHook = { renderers: new w.Map([[1, { rendererPackageName: 'react-dom' }]]) };
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = reactHook;
    w.__VUE__ = true;
    w.__svelte = { v: new w.Set(['5']) };
    w.__PREACT_DEVTOOLS__ = { renderers: new w.Map([[1, {}]]) };
    w.Solid$$ = true;
    w.Alpine = { version: '3.15.0', start() {} };
    w.litHtmlVersions = ['3.3.0'];
    expect(w.__REACT_DEVTOOLS_GLOBAL_HOOK__).toBe(reactHook);
  });
  expect(ids(result)).toEqual(['alpine','lit','preact','react','solid','svelte','vue']);
  expect(reactHook.renderers.size).toBe(1);
});
test('Vue, Preact and Alpine mounted roots contribute inherited coverage', async () => {
  const result = await detect(w => {
    const root = w.document.getElementById('app');
    root.__vue_app__ = { version: '3' };
    root.__k = { __k: [], __e: root };
    root._x_dataStack = [{}];
  });
  expect(ids(result)).toEqual(['alpine','preact','vue']);
  expect(result.frameworks.every(f => f.coverage === 2)).toBe(true);
});
test('detects frameworks inside open shadow roots', async () => {
  const result = await detect(w => {
    const shadow = w.document.getElementById('app').attachShadow({ mode: 'open' });
    shadow.innerHTML = '<p>Shadow</p>';
    shadow._$litPart$ = {};
    shadow.firstElementChild['__reactFiber$shadow'] = {};
  });
  expect(ids(result)).toEqual(['lit','react']);
});
test('solid hydration is distinguished from its less specific SSR attribute', async () => {
  const result = await detect(w => { w._$HY = { completed: new w.WeakSet() }; }, '<main data-hk="0">SSR</main>');
  expect(ids(result)).toEqual(['solid']);
  expect(result.frameworks[0].signals).toEqual(['solid-hydration','solid-marker']);
});
test('a throwing page getter cannot crash detection', async () => {
  const result = await detect(w => {
    Object.defineProperty(w, '__svelte', { get() { throw new Error('hostile'); } });
    w.litHtmlVersions = ['3.0.0'];
  });
  expect(ids(result)).toEqual(['lit']);
});
test('large DOM is bounded and reports incomplete sampling', async () => {
  const result = await detect(() => {}, '<div>' + '<p>x</p>'.repeat(6000) + '</div>');
  expect(result.truncated).toBe(true);
});
test('untrusted reports are allowlisted, deduplicated, bounded and ranked by ownership', () => {
  const result = loadCatalog().sanitize({ frameworks: [
    { id: 'svelte', signals: ['svelte-runtime'], coverage: 1 },
    { id: 'react', signals: ['react-fiber', '<img src=x onerror=alert(1)>'], coverage: 100 },
    { id: 'react', signals: ['react-renderer'], coverage: 999 },
    { id: '__proto__', signals: ['react-fiber'], coverage: Infinity },
    { id: 'vue', signals: ['react-renderer'] },
  ] });
  expect(result.frameworks).toEqual([
    { id: 'react', signals: ['react-fiber'], coverage: 100 },
    { id: 'svelte', signals: ['svelte-runtime'], coverage: 1 },
  ]);
});
