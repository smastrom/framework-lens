export async function copyDirectory(source, destination) {
  for await (const path of new Bun.Glob('**/*').scan({ cwd: source, onlyFiles: true })) {
    await Bun.write(`${destination}/${path}`, Bun.file(`${source}/${path}`));
  }
}
