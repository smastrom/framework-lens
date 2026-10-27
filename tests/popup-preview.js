// Visual fixture only; this file is never packaged in the extension.
(() => {
  const state = new URLSearchParams(location.search).get('state') || 'mixed';
  const result = { frameworks: state === 'empty' || state === 'protected' ? [] : [
    { id: 'vue', signals: ['vue-app', 'vue-runtime'], coverage: 300 },
    { id: 'react', signals: ['react-fiber'], coverage: 20 },
    { id: 'svelte', signals: ['svelte-runtime'], coverage: 0 },
  ], truncated: false };
  window.browser = {
    tabs: { query: async () => [{ id: 123, url: 'https://example.com/' }] },
    runtime: { sendMessage: async message => message.type === 'rescan' ? { available: state !== 'protected' } : result },
    storage: { onChanged: { addListener() {} } },
  };
})();
