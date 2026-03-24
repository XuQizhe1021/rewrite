import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'

const root = process.cwd()
const distDir = path.join(root, 'dist')
const publicDir = path.join(root, 'public')

await rm(distDir, { recursive: true, force: true })
await mkdir(distDir, { recursive: true })

await cp(publicDir, distDir, { recursive: true })

const entryPoints = [
  { in: 'src/background/index.ts', out: 'background', format: 'esm' },
  { in: 'src/content/index.ts', out: 'content', format: 'iife' },
  { in: 'src/popup/index.ts', out: 'popup', format: 'iife' },
  { in: 'src/sidepanel/index.ts', out: 'sidepanel', format: 'iife' },
  { in: 'src/options/index.ts', out: 'options', format: 'iife' },
]

const results = []
for (const ep of entryPoints) {
  const result = await build({
    entryPoints: [path.join(root, ep.in)],
    bundle: true,
    format: ep.format,
    target: ['es2020'],
    platform: 'browser',
    outfile: path.join(distDir, `${ep.out}.js`),
    sourcemap: true,
    legalComments: 'none',
    define: {
      __DEV__: 'false',
    },
    logLevel: 'info',
    metafile: true,
  })
  results.push({ out: ep.out, meta: result.metafile })
}

await writeFile(
  path.join(distDir, 'build-meta.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
)

