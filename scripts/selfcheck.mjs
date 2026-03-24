import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const distDir = path.join(root, 'dist')
const manifestPath = path.join(distDir, 'manifest.json')

const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))

const allowedPermissions = new Set([
  'storage',
  'activeTab',
  'scripting',
  'sidePanel',
  'contextMenus',
  'permissions',
])

const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : []
const unknown = permissions.filter((p) => !allowedPermissions.has(p))
if (unknown.length > 0) {
  throw new Error(`manifest.permissions contains unexpected items: ${unknown.join(', ')}`)
}

if (Array.isArray(manifest.host_permissions) && manifest.host_permissions.includes('<all_urls>')) {
  throw new Error('host_permissions contains <all_urls>, violates minimal permission policy')
}

const requiredFiles = [
  'background.js',
  'content.js',
  'popup.html',
  'popup.js',
  'sidepanel.html',
  'sidepanel.js',
  'options.html',
  'options.js',
]

for (const f of requiredFiles) {
  await stat(path.join(distDir, f))
}

const distStat = await stat(distDir)
if (!distStat.isDirectory()) {
  throw new Error('dist is not a directory')
}

const sizes = []
for (const f of requiredFiles) {
  const s = await stat(path.join(distDir, f))
  sizes.push({ f, bytes: s.size })
}
const totalBytes = sizes.reduce((acc, x) => acc + x.bytes, 0)
const totalMb = (totalBytes / 1024 / 1024).toFixed(2)

console.log('Permissions:', permissions.join(', '))
console.log(
  'Dist sizes:',
  sizes
    .map((x) => `${x.f}=${(x.bytes / 1024).toFixed(1)}KB`)
    .join(' '),
)
console.log(`Dist total (required files): ${totalMb}MB`)

console.log('Selfcheck OK')

