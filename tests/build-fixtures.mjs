import { compile } from 'svelte/compiler'
import { transformSync } from '@babel/core'
import { copyDirectory } from '../scripts/files.mjs'
import '../src/catalog.js'
const { ids: frameworkIds } = globalThis.FrameworkLens
const svelte = compile(
  '<script>let count = $state(0);</script><button onclick={() => count++}>Svelte {count}</button>',
  { filename: 'Fixture.svelte', dev: false }
)
await Bun.write('tests/.fixtures/svelte-component.js', svelte.js.code)
const solid = transformSync(
  'import {render} from "solid-js/web"; render(() => <button onClick={() => {}}>Solid app</button>, document.querySelector("#solid"));',
  { presets: ['babel-preset-solid'], filename: 'solid.jsx' }
).code
// The compiler is fixture-only: exercise a real standalone app in production
// mode and a development variant, without adding any extension dependencies.
const angular = (id, production) =>
  `import "@angular/compiler"; import {Component,enableProdMode,provideZonelessChangeDetection} from "@angular/core"; import {bootstrapApplication} from "@angular/platform-browser"; ${production ? 'enableProdMode();' : ''} class App {} Component({selector:"fixture-${id}",standalone:true,template:"<article><button>Angular app</button></article>"})(App); bootstrapApplication(App,{providers:[provideZonelessChangeDetection()]}).catch(console.error);`
const sources = {
  react:
    'import React from "react"; import {createRoot} from "react-dom/client"; createRoot(document.querySelector("#react")).render(React.createElement("article", null, ...Array.from({length:30}, (_,i)=>React.createElement("p", {key:i}, "React "+i))));',
  vue: 'import {createApp, h} from "vue"; createApp({render:()=>h("div", null, [h("button", "Vue app")])}).mount("#vue");',
  svelte:
    'import {mount} from "svelte"; import App from "./svelte-component.js"; mount(App, {target:document.querySelector("#svelte")});',
  preact:
    'import {h,render} from "preact"; render(h("div",null,h("button",null,"Preact app")),document.querySelector("#preact"));',
  alpine: 'import Alpine from "alpinejs"; window.Alpine=Alpine; Alpine.start();',
  lit: 'import {LitElement,html} from "lit"; class FixtureElement extends LitElement{render(){return html`<button>Lit component</button>`}}; customElements.define("fixture-element",FixtureElement); document.querySelector("#lit").append(document.createElement("fixture-element"));',
  solid,
  angular: angular('angular', true),
  'angular-dev': angular('angular-dev', false),
}
for (const [id, contents] of Object.entries(sources)) {
  const entrypoint = `tests/.fixtures/${id}-entry.js`
  await Bun.write(entrypoint, contents)
  const build = await Bun.build({
    entrypoints: [entrypoint],
    outdir: 'tests/.fixtures',
    naming: `${id}.js`,
    minify: id !== 'angular-dev',
    format: 'iife',
    target: 'browser',
    conditions: ['browser'],
    define: {
      'process.env.NODE_ENV': '"production"',
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
      ...(id === 'angular' ? { ngDevMode: 'false' } : {}),
    },
  })
  if (!build.success) throw new Error(build.logs.map((log) => log.message).join('\n'))
  await Bun.write(`tests/.fixtures/${id}.html`, page([id]))
}
function page(ids) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Framework Lens test</title></head><body>${ids
    .map((id) => {
      const tag = id.startsWith('angular') ? `fixture-${id}` : 'div'
      return `<${tag} id="${id}"${id === 'alpine' ? ' x-data="{count:0}"' : ''}></${tag}>`
    })
    .join('')}${ids.map((id) => `<script src="${id}.js"></script>`).join('')}</body></html>`
}
await Bun.write('tests/.fixtures/mixed.html', page(frameworkIds))
await Bun.write(
  'tests/.fixtures/plain.html',
  '<!doctype html><title>React Vue Svelte Solid Alpine Lit Preact Angular</title><h1>Just words, not frameworks</h1><div class="svelte-123" x-data="{}">Uninitialized markup</div><app-root _nghost-abc><p _ngcontent-abc>Unused Angular markup</p></app-root>'
)
await Bun.write(
  'tests/.fixtures/angular-ssr.html',
  '<!doctype html><title>Angular SSR</title><fixture-angular ng-version="22.2.3"><article><p>Server-rendered Angular</p></article></fixture-angular>'
)
await Bun.write(
  'tests/.fixtures/angular-late.html',
  '<!doctype html><meta charset="utf-8"><title>Late Angular bootstrap</title><fixture-angular id="angular"></fixture-angular><script>setTimeout(()=>{let s=document.createElement("script");s.src="angular.js";document.body.append(s)},2200)</script>'
)
await Bun.write(
  'tests/.fixtures/late.html',
  '<!doctype html><title>Late hydration</title><div id="vue"></div><script>setTimeout(()=>{let s=document.createElement("script");s.src="vue.js";document.body.append(s)},2200)</script>'
)
await Bun.write(
  'tests/.fixtures/csp.html',
  '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; object-src \'none\'"><title>CSP</title><div id="react"></div><script src="react.js"></script>'
)
await Bun.write(
  'tests/.fixtures/iframe.html',
  '<!doctype html><title>Plain page with embed</title><h1>No main framework</h1><iframe src="react.html"></iframe>'
)
// A deterministic visual fixture runs the unchanged popup script and styles.
for (const folder of ['popup', 'icons']) await copyDirectory(folder, `tests/.fixtures/${folder}`)
await Bun.write('tests/.fixtures/src/catalog.js', Bun.file('src/catalog.js'))
await Bun.write('tests/.fixtures/popup-preview.js', Bun.file('tests/popup-preview.js'))
const popup = await Bun.file('popup/index.html').text()
await Bun.write(
  'tests/.fixtures/popup/index.html',
  popup.replace(
    '<script src="../src/catalog.js"',
    '<script src="../popup-preview.js"></script><script src="../src/catalog.js"'
  )
)
const iconSuffixes = ['', ...Array.from({ length: frameworkIds.length - 1 }, (_, i) => `-${i + 2}`)]
await Bun.write(
  'tests/.fixtures/icons.html',
  '<!doctype html><meta charset="utf-8"><title>Toolbar assets</title><body style="background:#f8f9fc;font:12px system-ui;padding:20px"><h1>Framework Lens · Toolbar icons</h1>' +
    frameworkIds
      .map(
        (id) =>
          `<div style="display:flex;align-items:center;gap:16px;margin:15px"><span style="width:48px">${id}</span>${iconSuffixes.map((suffix) => `<img width="32" height="32" src="icons/${id}${suffix}.svg" alt="${id}${suffix}">`).join('')}</div>`
      )
      .join('')
)
console.log(
  `Built production fixtures for all ${frameworkIds.length} frameworks, Angular development/SSR, mixed frameworks, delayed hydration and CSP.`
)
