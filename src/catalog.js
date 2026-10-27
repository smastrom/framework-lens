/* Shared only by extension pages, never by the website. */
globalThis.FrameworkLens = (() => {
  const frameworks = {
    react: { name: 'React', color: '#087ea4', site: 'https://react.dev/' },
    vue: { name: 'Vue', color: '#21865c', site: 'https://vuejs.org/' },
    svelte: { name: 'Svelte', color: '#e34212', site: 'https://svelte.dev/' },
    solid: { name: 'Solid', color: '#446b9e', site: 'https://www.solidjs.com/' },
    alpine: { name: 'Alpine', color: '#477482', site: 'https://alpinejs.dev/' },
    lit: { name: 'Lit', color: '#324fff', site: 'https://lit.dev/' },
    preact: { name: 'Preact', color: '#673ab8', site: 'https://preactjs.com/' },
  };
  const ids = Object.keys(frameworks);
  // Page-world data is untrusted. Only these fixed codes can reach the popup.
  const evidence = {
    'react-renderer': 'React DevTools renderer registration',
    'react-fiber': 'React DOM fiber / root ownership',
    'vue-hook': 'Vue DevTools app registration',
    'vue-app': 'Vue mounted app / component marker',
    'vue-runtime': 'Vue runtime flag',
    'svelte-runtime': 'Svelte version registry',
    'svelte-event': 'Svelte component registration event',
    'svelte-node': 'Svelte component metadata',
    'preact-renderer': 'Preact DevTools renderer registration',
    'preact-root': 'Preact virtual DOM root',
    'solid-devtools': 'Solid development runtime',
    'solid-hydration': 'Solid hydration registry',
    'solid-marker': 'Solid hydration attribute (SSR signal)',
    'solid-events': 'Solid delegated event registry',
    'alpine-runtime': 'Alpine runtime',
    'alpine-node': 'Alpine initialized component',
    'lit-runtime': 'Lit version registry',
    'lit-node': 'Lit render part / element',
  };
  function sanitize(input) {
    if (!input || !Array.isArray(input.frameworks)) return null;
    const seen = new Set();
    const items = [];
    for (const item of input.frameworks.slice(0, 7)) {
      if (!item || !ids.includes(item.id) || seen.has(item.id)) continue;
      const signals = Array.isArray(item.signals)
        ? [...new Set(item.signals.filter(s => typeof s === 'string' && s.startsWith(item.id + '-') && Object.hasOwn(evidence, s)))].slice(0, 4)
        : [];
      if (!signals.length) continue;
      seen.add(item.id);
      items.push({ id: item.id, signals, coverage: Number.isFinite(item.coverage) ? Math.min(4000, Math.max(0, Math.round(item.coverage))) : 0 });
    }
    items.sort((a, b) => b.coverage - a.coverage || strength(b) - strength(a) || ids.indexOf(a.id) - ids.indexOf(b.id));
    return { frameworks: items, truncated: input.truncated === true };
  }
  function strength(item) {
    return item.signals.every(s => s === 'solid-marker') ? 0 : 1;
  }
  return { frameworks, ids, evidence, sanitize };
})();
