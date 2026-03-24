import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { context } from 'esbuild'

const root = process.cwd()
const distDir = path.join(root, 'dist')
const publicDir = path.join(root, 'public')

await mkdir(distDir, { recursive: true })
await cp(publicDir, distDir, { recursive: true, force: true })

const entryPoints = [
  { in: 'src/background/index.ts', out: 'background', format: 'esm' },
  { in: 'src/content/index.ts', out: 'content', format: 'iife' },
  { in: 'src/popup/index.ts', out: 'popup', format: 'iife' },
  { in: 'src/sidepanel/index.ts', out: 'sidepanel', format: 'iife' },
  { in: 'src/options/index.ts', out: 'options', format: 'iife' },
]

const contexts = []

for (const ep of entryPoints) {
  const ctx = await context({
    entryPoints: [path.join(root, ep.in)],
    bundle: true,
    format: ep.format,
    target: ['es2020'],
    platform: 'browser',
    outfile: path.join(distDir, `${ep.out}.js`),
    sourcemap: true,
    legalComments: 'none',
    define: {
      __DEV__: 'true',
    },
  })

  contexts.push(ctx)
}

for (const ctx of contexts) {
  await ctx.watch()
}

console.log('Watching. Reload the extension from chrome://extensions after rebuild.')

