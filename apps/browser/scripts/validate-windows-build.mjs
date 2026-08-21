import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { rcedit } from 'rcedit'

const here = dirname(fileURLToPath(import.meta.url))
const browserRoot = resolve(here, '..')
const require = createRequire(import.meta.url)
const playwrightRoot = dirname(require.resolve('playwright-core'))
const registry = JSON.parse(readFileSync(resolve(playwrightRoot, 'browsers.json'), 'utf8'))
const pinned = registry.browsers.find((browser) => browser.name === 'chromium')
const config = JSON.parse(readFileSync(resolve(browserRoot, 'browser.config.json'), 'utf8'))
const windowsBuildSource = readFileSync(resolve(browserRoot, 'scripts/build-windows.mjs'), 'utf8')

if (config.platform !== 'win64' || config.channel !== 'stable') throw new Error('仅允许 stable/win64 构建')
if (config.playwrightVersion !== '1.56.1') throw new Error('Playwright 版本未与依赖锁保持一致')
if (pinned?.browserVersion !== config.chromiumVersion) {
  throw new Error(`固定 Chromium 版本不一致：${pinned?.browserVersion} != ${config.chromiumVersion}`)
}
if (typeof rcedit !== 'function') throw new Error('rcedit 不可用')
if (windowsBuildSource.includes("run(executable, ['--version']")) {
  throw new Error('不得通过启动 chrome.exe --version 校验版本，该进程可能在 Windows 上持续运行')
}
if (!windowsBuildSource.includes('.VersionInfo.ProductVersion')) {
  throw new Error('Windows 构建必须从 chrome.exe 文件元数据读取 Chromium 版本')
}

for (const name of ['launcher', 'updater', 'sfx']) {
  await build({
    entryPoints: [resolve(browserRoot, 'src', `${name}.ts`)],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    write: false,
    logLevel: 'silent',
  })
}

console.log(`Windows 构建配置有效：Chromium ${config.chromiumVersion} / Playwright ${config.playwrightVersion}`)
