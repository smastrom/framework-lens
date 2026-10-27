for (const id of ['react', 'vue', 'svelte', 'solid', 'alpine', 'lit', 'preact']) {
  const svg = await Bun.file(`icons/${id}.svg`).text();
  const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
  const opening = svg.match(/<svg\b[^>]*>/)[0];
  const body = svg.slice(svg.indexOf(opening) + opening.length, svg.lastIndexOf('</svg>'));
  const rootFill = opening.match(/\bfill="([^"]+)"/)?.[1];
  for (let count = 2; count <= 7; count++) {
    // A real circular counter, baked into the toolbar SVG at every scale.
    const output = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><svg x="0" y="0" width="32" height="32" viewBox="${viewBox}"${rootFill ? ` fill="${rootFill}"` : ''}>${body}</svg><circle cx="30" cy="30" r="9" fill="#6256dc" stroke="#fff" stroke-width="1.5"/><text x="30" y="30" dy=".36em" font-family="Arial,sans-serif" font-size="12" font-weight="700" text-anchor="middle" fill="#fff">${count}</text></svg>\n`;
    await Bun.write(`icons/${id}-${count}.svg`, output);
  }
}
