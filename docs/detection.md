# Detection reference

The extension implements small, read-only checks against upstream runtime protocols. It does not copy the full DevTools implementations, install replacement global hooks, retain component trees, patch console methods, enable profiling, or force development mode in production applications.

Sources were inspected on 27 October 2026. “DevTools signal” below means an existing registration that can be read; an extension-created, empty hook is never sufficient evidence.

| Framework | Signals used | Upstream reference |
| --- | --- | --- |
| React | Existing `__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers` entries identified as React renderers; `__reactFiber$`, `__reactContainer$`, legacy internal-instance and root markers on DOM nodes. | [DevTools hook and renderer registration](https://github.com/facebook/react/blob/e9df86ca6991b779ee50bc744ad8bbdeefa9bae6/packages/react-devtools-shared/src/hook.js); [React DOM’s stable property prefixes](https://github.com/facebook/react/blob/e9df86ca6991b779ee50bc744ad8bbdeefa9bae6/packages/react-dom-bindings/src/client/ReactDOMComponentTree.js) |
| Vue | Existing hook apps/app records, `__VUE__`, mounted `__vue_app__`, Vue 2 `__vue__`, and component ownership markers. | [DevTools hook installation](https://github.com/vuejs/devtools/blob/6ec530bee1c35e48d30655a2b6602c90a1cb318c/packages/kit/src/hook/install.ts); [extension backend detection](https://github.com/vuejs/devtools/blob/6ec530bee1c35e48d30655a2b6602c90a1cb318c/packages/chrome/src/content/backend.ts); [Vue runtime and mounted app markers](https://github.com/vuejs/core/blob/main/packages/runtime-core/src/apiCreateApp.ts) |
| Svelte | `window.__svelte.v` version set, `SvelteRegisterComponent`, and development DOM metadata. | [Official extension’s version-set sensor](https://github.com/sveltejs/svelte-devtools/blob/4ac64c3dbb83107b1838ec615003cb3511944409/workspace/extension/static/background.js); [component registration listener](https://github.com/sveltejs/svelte-devtools/blob/4ac64c3dbb83107b1838ec615003cb3511944409/workspace/extension/src/client/svelte-4.js) |
| Preact | Existing `__PREACT_DEVTOOLS__.renderers`, Preact registrations in an existing React-compatible hook, and mounted root VNodes with matching child/DOM properties, including production names `__k`/`__e`. | [DevTools hook protocol](https://github.com/preactjs/preact-devtools/blob/5a4eecd233ad2eac082bcd6c5e71edf52785cb4a/src/adapter/hook.ts); [adapter bindings for both property spellings](https://github.com/preactjs/preact-devtools/blob/5a4eecd233ad2eac082bcd6c5e71edf52785cb4a/src/adapter/10/bindings.ts); [runtime root VNode](https://github.com/preactjs/preact/blob/main/src/render.js) |
| Solid | `Solid$$`, `SolidDevtools$$`, `_$HY.completed`, and `data-hk`, matching the DevTools detector. Also reads the runtime’s `document._$DX_DELEGATE` event set as a production fallback. | [Solid DevTools detection](https://github.com/thetarnav/solid-devtools/blob/e322faab1d4b802028ad0aca3078b977af0e9c48/packages/shared/src/detect.ts); [official delegated-event runtime](https://github.com/solidjs/solid/blob/main/packages/solid/web/src/client.ts) |
| Alpine | `window.Alpine` with its version/start API, initialized `_x_dataStack` and legacy `__x` components. | [Community DevTools detector](https://github.com/alpine-collective/alpinejs-devtools/blob/07cb5984b4cd3715915e784147db9c1ddae85f14/packages/browser-extension/src/scripts/detector.ts); [official component data stack](https://github.com/alpinejs/alpine/blob/8d3d9a2f98385d4c879f4b5be080a0221279ed4d/packages/alpinejs/src/scope.js) |
| Lit | Official `litHtmlVersions` / `litElementVersions` arrays, render parts and LitElement class marker. | [lit-html version and render-part markers](https://github.com/lit/lit/blob/16507ef656417c9c53a55a02a44a563bbbf2c484/packages/lit-html/src/lit-html.ts); [LitElement version and class markers](https://github.com/lit/lit/blob/16507ef656417c9c53a55a02a44a563bbbf2c484/packages/lit-element/src/lit-element.ts) |

## Deliberate differences from full DevTools

- React and Preact DevTools install early hooks and instrument renderers. Framework Lens reads existing registrations and uses mounted DOM markers when those tools are absent. This avoids blocking official DevTools hook installation and avoids per-render instrumentation overhead.
- Vue’s debugging backend tracks app lifecycle and component events. This extension reads the resulting registrations or stable app markers, without enabling that backend.
- Solid DevTools also downloads script resources and scans their source for signatures. Framework Lens omits those downloads. It can miss production client-only Solid apps with no detectable runtime, hydration or delegated-event marker. Reading the existing delegated-event set is an additional check grounded in Solid’s runtime.
- Alpine’s community detector also accepts bare `x-data`/`data-x-data` markup. This extension requires an initialized runtime or component, so a code example or unused directive does not suffice.
- Lit uses official runtime markers. This is not presented as a port of an official browser DevTools extension.

No scheme has exact parity with all versions of every DevTools extension. These protocols can change. The real-browser fixtures exercise the dependency versions pinned in `bun.lock`, not every framework version ever released.

## Ranking

A bounded walk counts each sampled element for every framework whose mounted root owns it. Direct DOM markers can add ownership, and open shadow roots are traversed. The highest coverage ranks first. Runtime-only evidence breaks coverage ties ahead of the weaker Solid attribute-only signal; remaining ties use the catalog’s stable order. Frameworks with no measurable DOM ownership can still be detected, but their relative importance cannot be reliably inferred.

Only the top-level page is inspected. A plain parent page with a React iframe is intentionally reported as undetected. “Additional” means another detected framework, not another version of the same framework.

## Assets

React, Vue, Svelte, Solid, Lit and Preact logos are sourced from [SVGL’s framework assets](https://github.com/pheralb/svgl/tree/main/static/library). Alpine’s symbol comes from [Simple Icons](https://github.com/simple-icons/simple-icons/blob/develop/icons/alpinedotjs.svg), distributed under [CC0](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md). Colors and original logo geometry are preserved; circular toolbar counters and the Framework Lens icon are generated locally. Framework trademarks remain the property of their owners. SVGL’s repository notice is retained in [the asset notice](asset-notice.txt).
