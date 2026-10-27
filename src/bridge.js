(() => {
  if (globalThis.__frameworkLensBridge) return;
  globalThis.__frameworkLensBridge = true;
  const CHANNEL = 'framework-lens:v1';
  const documentToken = crypto.randomUUID();
  let lastSent = 0;
  let pending;
  let timer;
  function send() {
    timer = undefined;
    if (!pending) return;
    lastSent = Date.now();
    const payload = pending;
    pending = undefined;
    browser.runtime.sendMessage({ type: 'report', documentToken, payload }).catch(() => {});
  }
  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.channel !== CHANNEL || event.data.type !== 'result') return;
    const value = event.data.payload;
    if (!value || !Array.isArray(value.frameworks) || value.frameworks.length > 7) return;
    // Coalesce page messages, including malicious floods, to at most two per second.
    pending = { frameworks: value.frameworks.map(f => f && ({ id: f.id, signals: Array.isArray(f.signals) ? f.signals.slice(0, 4) : [], coverage: f.coverage })), truncated: value.truncated === true };
    if (Date.now() - lastSent >= 500) send();
    else if (!timer) timer = setTimeout(send, 500);
  });
  browser.runtime.onMessage.addListener(message => {
    if (message?.type === 'scan') window.postMessage({ channel: CHANNEL, type: 'scan' }, '*');
  });
})();
