import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { rcedit } from 'rcedit'

if (process.platform !== 'win32') throw new Error('Windows 便携包必须在 Windows x64 构建机上生成')
if (process.arch !== 'x64') throw new Error('阿康浏览器仅构建 Windows x64')

const here = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const { inject } = require('postject')
const browserRoot = resolve(here, '..')
const repositoryRoot = resolve(browserRoot, '../..')
const buildRoot = resolve(browserRoot, 'dist/windows-build')
const portable = resolve(buildRoot, 'portable')
const seaRoot = resolve(buildRoot, 'sea')
const chromiumCache = resolve(buildRoot, 'playwright-browsers')
const chromiumIcon = resolve(seaRoot, 'chromium.ico')
const releaseRoot = resolve(repositoryRoot, process.env.DBKANG_BROWSER_RELEASE_DIR || 'release/browser')
const config = JSON.parse(readFileSync(resolve(browserRoot, 'browser.config.json'), 'utf8'))
const version = process.env.DBKANG_VERSION || '0.1.0'
const publicBaseUrl = (process.env.DBKANG_PUBLIC_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
const stableBaseUrl = `${publicBaseUrl}/updates/browser/stable`

rmSync(buildRoot, { recursive: true, force: true })
rmSync(releaseRoot, { recursive: true, force: true })
mkdirSync(portable, { recursive: true })
mkdirSync(seaRoot, { recursive: true })
mkdirSync(releaseRoot, { recursive: true })
copyFileSync(
  resolve(repositoryRoot, 'apps/userscript/dist/DBKangToolbox.user.js'),
  resolve(releaseRoot, 'DBKangToolbox.user.js'),
)

run(process.execPath, [resolve(here, 'build-extension.mjs')], {
  DBKANG_VERSION: version,
  DBKANG_PUBLIC_BASE_URL: publicBaseUrl,
})
installChromium()
cpSync(resolve(browserRoot, 'dist/extension'), resolve(portable, 'extension'), { recursive: true })
writeFileSync(
  resolve(portable, 'browser-config.json'),
  `${JSON.stringify(
    {
      version,
      chromiumVersion: config.chromiumVersion,
      feedUrl: `${stableBaseUrl}/latest.json`,
      homePage: config.homePage,
    },
    null,
    2,
  )}\n`,
)
writeFileSync(
  resolve(portable, '使用说明.txt'),
  [
    '阿康浏览器',
    '',
    '双击 DBKangBrowser.exe 启动。浏览器数据永久保存在同目录 user-data 文件夹。',
    '请勿单独移动 browser、extension 或 DBKangUpdater.exe。',
    '更新不会覆盖 user-data；所有窗口关闭后 Chromium 后台进程会退出。',
    '',
  ].join('\r\n'),
)

await bundleEntry('launcher')
await bundleEntry('updater')
await createSeaExecutable('launcher', resolve(portable, 'DBKangBrowser.exe'))
await createSeaExecutable('updater', resolve(portable, 'DBKangUpdater.exe'))

run(resolve(portable, 'DBKangBrowser.exe'), ['--self-test'], undefined, portable)
run(resolve(portable, 'DBKangUpdater.exe'), ['--self-test'], undefined, portable)

const fullDirectory = resolve(releaseRoot, 'browser/stable/full')
mkdirSync(fullDirectory, { recursive: true })
const fullArchive = resolve(fullDirectory, `${version}.zip`)
compressDirectory(portable, fullArchive)

const manifest = buildManifest(fullArchive)
const manifestDirectory = resolve(releaseRoot, 'browser/stable/manifests')
mkdirSync(manifestDirectory, { recursive: true })
const manifestPath = resolve(manifestDirectory, `${version}.json`)
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

const filesRoot = resolve(releaseRoot, 'browser/stable/files', version)
for (const file of manifest.files) {
  const source = resolvePortable(portable, file.path)
  const target = resolvePortable(filesRoot, file.path)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(source, target)
}

const latest = {
  schemaVersion: 1,
  channel: 'stable',
  version,
  chromiumVersion: config.chromiumVersion,
  manifestUrl: `${stableBaseUrl}/manifests/${encodeURIComponent(version)}.json`,
  manifestSha256: sha256File(manifestPath),
}
writeFileSync(resolve(releaseRoot, 'browser/stable/latest.json'), `${JSON.stringify(latest, null, 2)}\n`)

await bundleEntry('sfx')
const setupVersioned = resolve(releaseRoot, `DBKangBrowser-Setup-${version}.exe`)
await createSeaExecutable('sfx', setupVersioned, {
  'portable.zip': fullArchive,
  'manifest.json': manifestPath,
})
run(setupVersioned, ['--self-test'], undefined, releaseRoot)
writeFileSync(
  resolve(releaseRoot, 'SHA256SUMS.txt'),
  [
    `${sha256File(setupVersioned)}  ${basenamePortable(setupVersioned)}`,
    `${sha256File(fullArchive)}  browser/stable/full/${version}.zip`,
    `${sha256File(manifestPath)}  browser/stable/manifests/${version}.json`,
    '',
  ].join('\n'),
)

function installChromium() {
  const playwrightRoot = dirname(require.resolve('playwright-core'))
  const cli = resolve(playwrightRoot, 'cli.js')
  const registry = JSON.parse(readFileSync(resolve(playwrightRoot, 'browsers.json'), 'utf8'))
  const pinnedChromium = registry.browsers.find((browser) => browser.name === 'chromium')
  if (pinnedChromium?.browserVersion !== config.chromiumVersion) {
    throw new Error(
      `Playwright 内置 Chromium 版本不符：期望 ${config.chromiumVersion}，实际 ${pinnedChromium?.browserVersion}`,
    )
  }
  run(process.execPath, [cli, 'install', 'chromium', '--no-shell'], {
    PLAYWRIGHT_BROWSERS_PATH: chromiumCache,
    PLAYWRIGHT_SKIP_BROWSER_GC: '1',
  })
  const executable = findFile(chromiumCache, 'chrome.exe')
  if (!executable || !executable.toLowerCase().includes('chrome-win')) {
    throw new Error('未找到 Playwright 的 Windows Chromium headed 构建')
  }
  console.log('正在读取 Chromium 文件版本…')
  const versionResult = run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '(Get-Item -LiteralPath $env:DBKANG_CHROMIUM_EXECUTABLE).VersionInfo.ProductVersion',
    ],
    { DBKANG_CHROMIUM_EXECUTABLE: executable },
    dirname(executable),
    true,
    30_000,
  )
  const productVersion = versionResult.stdout.trim()
  if (!productVersion.includes(config.chromiumVersion)) {
    throw new Error(`Chromium 版本不符：期望 ${config.chromiumVersion}，实际 ${productVersion || '未知'}`)
  }
  console.log('正在复制 Chromium 便携文件…')
  cpSync(dirname(executable), resolve(portable, 'browser'), { recursive: true })
  const iconScript = [
    'Add-Type -AssemblyName System.Drawing',
    '$icon=[System.Drawing.Icon]::ExtractAssociatedIcon($env:DBKANG_CHROMIUM_EXECUTABLE)',
    '$stream=[System.IO.File]::Create($env:DBKANG_CHROMIUM_ICON)',
    '$icon.Save($stream)',
    '$stream.Dispose()',
  ].join(';')
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', iconScript], {
    DBKANG_CHROMIUM_EXECUTABLE: executable,
    DBKANG_CHROMIUM_ICON: chromiumIcon,
  })
}

async function bundleEntry(name) {
  await build({
    entryPoints: [resolve(browserRoot, 'src', `${name}.ts`)],
    outfile: resolve(seaRoot, `${name}.cjs`),
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    minify: true,
    sourcemap: false,
  })
}

async function createSeaExecutable(name, output, assets) {
  const seaConfigPath = resolve(seaRoot, `${name}-sea.json`)
  const blob = resolve(seaRoot, `${name}.blob`)
  writeFileSync(
    seaConfigPath,
    `${JSON.stringify(
      {
        main: resolve(seaRoot, `${name}.cjs`),
        output: blob,
        disableExperimentalSEAWarning: true,
        useSnapshot: false,
        useCodeCache: false,
        ...(assets ? { assets } : {}),
      },
      null,
      2,
    )}\n`,
  )
  run(process.execPath, ['--experimental-sea-config', seaConfigPath])
  mkdirSync(dirname(output), { recursive: true })
  copyFileSync(process.execPath, output)
  const signature = spawnSync('signtool.exe', ['remove', '/s', output], { windowsHide: true, stdio: 'ignore' })
  if (signature.error && signature.error.code !== 'ENOENT') throw signature.error
  await rcedit(output, {
    icon: chromiumIcon,
    'file-version': windowsVersion(version),
    'product-version': windowsVersion(version),
    'version-string': {
      ProductName: name === 'sfx' ? '阿康浏览器安装程序' : '阿康浏览器',
      FileDescription:
        name === 'launcher' ? '阿康浏览器' : name === 'updater' ? '阿康浏览器更新器' : '阿康浏览器安装程序',
      CompanyName: 'DBKang Toolbox',
      OriginalFilename: basenamePortable(output),
    },
  })
  await inject(output, 'NODE_SEA_BLOB', readFileSync(blob), {
    sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  })
}

function buildManifest(fullArchivePath) {
  const files = listFiles(portable).map((portablePath) => {
    const absolute = resolvePortable(portable, portablePath)
    return {
      path: portablePath,
      sha256: sha256File(absolute),
      size: statSync(absolute).size,
      url: `${stableBaseUrl}/files/${encodeURIComponent(version)}/${portablePath.split('/').map(encodeURIComponent).join('/')}`,
    }
  })
  return {
    schemaVersion: 1,
    version,
    chromiumVersion: config.chromiumVersion,
    files,
    full: {
      url: `${stableBaseUrl}/full/${encodeURIComponent(version)}.zip`,
      sha256: sha256File(fullArchivePath),
      size: statSync(fullArchivePath).size,
    },
  }
}

function compressDirectory(source, archive) {
  rmSync(archive, { force: true })
  run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "Compress-Archive -Path (Join-Path $env:DBKANG_ARCHIVE_SOURCE '*') -DestinationPath $env:DBKANG_ARCHIVE_TARGET -CompressionLevel Optimal -Force",
    ],
    {
      DBKANG_ARCHIVE_SOURCE: source,
      DBKANG_ARCHIVE_TARGET: archive,
    },
  )
}

function run(command, args, extraEnvironment, cwd = repositoryRoot, capture = false, timeout) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...extraEnvironment },
    windowsHide: true,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    timeout,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} 执行失败（${result.status}）：${result.stderr || ''}`)
  return result
}

function findFile(root, filename) {
  if (!existsSync(root)) return null
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const target = resolve(root, entry.name)
    if (entry.isDirectory()) {
      const nested = findFile(target, filename)
      if (nested) return nested
    } else if (entry.name.toLowerCase() === filename.toLowerCase()) return target
  }
  return null
}

function listFiles(root) {
  const files = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = resolve(directory, entry.name)
      if (entry.isDirectory()) visit(target)
      else if (entry.isFile()) files.push(relative(root, target).split(sep).join('/'))
    }
  }
  visit(root)
  return files.sort()
}

function resolvePortable(root, portablePath) {
  const target = resolve(root, ...portablePath.split('/'))
  if (!target.startsWith(resolve(root) + sep)) throw new Error(`路径越界：${portablePath}`)
  return target
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function basenamePortable(path) {
  return path.split(/[\\/]/).at(-1)
}

function windowsVersion(value) {
  return value
    .replace(/^v/i, '')
    .split(/[^0-9]+/)
    .filter(Boolean)
    .slice(0, 4)
    .concat(['0', '0', '0', '0'])
    .slice(0, 4)
    .join('.')
}
