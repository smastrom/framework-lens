import { test, expect } from 'bun:test'
import { loadCatalog } from './load-catalog.mjs'
const background = await Bun.file('src/background.js').text()
const runBackground = new Function('browser', 'FrameworkLens', background)
function setup() {
  const listeners = {}
  const event = (name) => ({
    addListener: (callback) => {
      listeners[name] = callback
    },
  })
  const values = {}
  const icons = []
  const browser = {
    runtime: {
      id: 'test@lens',
      getURL: (p) => 'moz-extension://test/' + p,
      onMessage: event('message'),
      onInstalled: event('install'),
    },
    storage: {
      session: {
        get: async (k) => ({ [k]: values[k] }),
        set: async (data) => Object.assign(values, data),
        remove: async (k) => {
          delete values[k]
        },
      },
    },
    action: { setIcon: async (data) => icons.push(data), setTitle: async () => {} },
    scripting: { executeScript: async () => [] },
    tabs: {
      onUpdated: event('updated'),
      onRemoved: event('removed'),
      onActivated: event('activated'),
      query: async () => [],
    },
    webNavigation: { onHistoryStateUpdated: event('history') },
  }
  runBackground(browser, loadCatalog())
  const sender = { id: 'test@lens', tab: { id: 9 }, frameId: 0, url: 'https://fixture.test/' }
  const popup = { id: 'test@lens', url: 'moz-extension://test/popup/index.html' }
  return { listeners, values, icons, sender, popup }
}
test('mixed results choose the main colored icon with a circular total-count asset', async () => {
  const t = setup()
  await t.listeners.message(
    {
      type: 'report',
      documentToken: 'doc',
      payload: {
        frameworks: [
          { id: 'vue', signals: ['vue-app'], coverage: 90 },
          { id: 'react', signals: ['react-fiber'], coverage: 10 },
        ],
      },
    },
    t.sender
  )
  expect(t.icons.at(-1).tabId).toBe(9)
  expect(t.icons.at(-1).path).toBe('icons/vue-2.svg')
  const saved = await t.listeners.message({ type: 'get', tabId: 9 }, t.popup)
  expect(saved.frameworks[0].id).toBe('vue')
})
test('Angular can be the main framework with an eight-framework counter', async () => {
  const t = setup()
  const catalog = loadCatalog()
  const frameworks = catalog.ids.map((id) => ({
    id,
    signals: [Object.keys(catalog.evidence).find((signal) => signal.startsWith(id + '-'))],
    coverage: id === 'angular' ? 100 : 1,
  }))
  await t.listeners.message(
    { type: 'report', documentToken: 'doc', payload: { frameworks } },
    t.sender
  )
  expect(t.icons.at(-1).path).toBe('icons/angular-8.svg')
  const saved = await t.listeners.message({ type: 'get', tabId: 9 }, t.popup)
  expect(saved.frameworks).toHaveLength(8)
  expect(saved.frameworks[0].id).toBe('angular')
})
test('new navigation clears the old result and restores the neutral icon', async () => {
  const t = setup()
  await t.listeners.message(
    {
      type: 'report',
      documentToken: 'doc',
      payload: { frameworks: [{ id: 'react', signals: ['react-fiber'], coverage: 2 }] },
    },
    t.sender
  )
  t.listeners.updated(9, { status: 'loading' })
  const saved = await t.listeners.message({ type: 'get', tabId: 9 }, t.popup)
  expect(saved.frameworks.length).toBe(0)
  expect(t.icons.at(-1).path).toBe('icons/lens.svg')
})
test('embedded reports and page-sent privileged commands are ignored', async () => {
  const t = setup()
  expect(
    t.listeners.message(
      { type: 'report', documentToken: 'doc', payload: { frameworks: [] } },
      { ...t.sender, frameId: 2 }
    )
  ).toBeUndefined()
  expect(t.listeners.message({ type: 'rescan', tabId: 123 }, t.sender)).toBeUndefined()
  expect(
    t.listeners.message({ type: 'get', tabId: 9 }, { ...t.popup, id: 'another-extension' })
  ).toBeUndefined()
  expect(t.values).toEqual({})
})
test('a closed tab releases its in-memory detection result', async () => {
  const t = setup()
  await t.listeners.message(
    { type: 'report', documentToken: 'doc', payload: { frameworks: [] } },
    t.sender
  )
  t.listeners.removed(9)
  // A queued read serializes behind removal.
  await t.listeners.message({ type: 'get', tabId: 9 }, t.popup)
  expect(t.values).toEqual({})
})
