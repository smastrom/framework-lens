import { test, expect } from 'bun:test';
import { JSDOM } from 'jsdom';
test('every toolbar SVG, including all circular counters, parses as a complete image', async () => {
  const dom = new JSDOM('');
  try {
    const files = [...new Bun.Glob('*.svg').scanSync({ cwd: 'icons', onlyFiles: true })];
    expect(files.length).toBe(50);
    for (const name of files) {
      const document = new dom.window.DOMParser().parseFromString(await Bun.file('icons/' + name).text(), 'image/svg+xml');
      expect(document.querySelector('parsererror'), name + ' is invalid XML').toBeNull();
      if (/-[2-7]\.svg$/.test(name)) {
        expect(document.querySelector('circle'), name + ' needs a circular counter').toBeTruthy();
        expect(document.querySelector('text').textContent).toBe(name.match(/-(\d)\.svg/)[1]);
      }
    }
  } finally { dom.window.close(); }
});
