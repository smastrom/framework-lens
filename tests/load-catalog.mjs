const source = await Bun.file('src/catalog.js').text()

export function loadCatalog() {
  const scope = {}
  new Function('globalThis', source)(scope)
  return scope.FrameworkLens
}
