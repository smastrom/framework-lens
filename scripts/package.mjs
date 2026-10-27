import JSZip from 'jszip'
const { version } = await Bun.file('manifest.json').json()
const path = `dist/framework-lens-${version}.xpi`
const zip = new JSZip()
const files = [...new Bun.Glob('**/*').scanSync({ cwd: 'extension', onlyFiles: true })].sort()
// Fixed metadata makes repeated builds of identical sources reproducible.
const date = new Date('1980-01-01T00:00:00Z')
for (const file of files)
  zip.file(file, await Bun.file(`extension/${file}`).arrayBuffer(), { date, createFolders: false })
await Bun.write(
  path,
  await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  })
)
console.log(`Packaged ${path}`)
