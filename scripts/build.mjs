import { $ } from 'bun'
import { copyDirectory } from './files.mjs'
const manifest = await Bun.file('manifest.json').json()
if (manifest.version !== (await Bun.file('package.json').json()).version)
  throw new Error('Version mismatch')
await $`rm -rf extension`.quiet()
await Bun.write('extension/manifest.json', Bun.file('manifest.json'))
for (const path of ['src', 'popup', 'icons']) await copyDirectory(path, `extension/${path}`)
console.log(`Built Framework Lens ${manifest.version} (no runtime dependencies).`)
