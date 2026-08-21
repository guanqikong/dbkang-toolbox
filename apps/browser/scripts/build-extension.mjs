import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const browserRoot = resolve(here, '..')
const repositoryRoot = resolve(browserRoot, '../..')
const output = resolve(browserRoot, 'dist/extension')
const source = resolve(browserRoot, 'extension')
const userscript = resolve(repositoryRoot, 'apps/userscript/dist/DBKangToolbox.user.js')
const unifiedUpdates = resolve(repositoryRoot, 'release/browser')
const version = process.env.DBKANG_VERSION || '0.1.3'
const publicBaseUrl = new URL(process.env.DBKANG_PUBLIC_BASE_URL || 'http://localhost:8000')

await mkdir(output, { recursive: true })
await cp(source, output, { recursive: true })
await cp(userscript, resolve(output, 'DBKangToolbox.user.js'))
await mkdir(unifiedUpdates, { recursive: true })
await cp(userscript, resolve(unifiedUpdates, 'DBKangToolbox.user.js'))
const manifestPath = resolve(output, 'manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
manifest.version = version.replace(/[^0-9.].*$/, '')
manifest.host_permissions = [
  ...new Set(
    manifest.host_permissions.map((permission) =>
      permission.replace('__DBKANG_API_ORIGIN__', publicBaseUrl.origin),
    ),
  ),
]
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
const backgroundPath = resolve(output, 'background.js')
const background = await readFile(backgroundPath, 'utf8')
await writeFile(backgroundPath, background.replace('__DBKANG_API_HOST__', publicBaseUrl.hostname))
