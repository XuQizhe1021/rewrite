import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import archiver from 'archiver'

const root = process.cwd()
const distDir = path.join(root, 'dist')
const outDir = path.join(root, 'artifacts')
const outFile = path.join(outDir, 'seo-content-cleaner-v1.zip')

await mkdir(outDir, { recursive: true })

const output = createWriteStream(outFile)
const archive = archiver('zip', { zlib: { level: 9 } })

archive.on('error', (err) => {
  throw err
})

archive.pipe(output)
archive.directory(distDir, false)
await archive.finalize()

console.log(`ZIP written: ${outFile}`)

