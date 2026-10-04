import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import type { BrowserConfig } from './common'
import { readJson } from './common'
import { showMessage } from './windows'

const rootArgument = process.argv.find((value) => value.startsWith('--portable-root='))
const portableRoot = rootArgument ? resolve(rootArgument.slice('--portable-root='.length)) : dirname(process.execPath)
const skipUpdate = process.argv.includes('--skip-update')
const updateToken = process.argv.find((value) => value.startsWith('--post-update-token='))?.slice(
  '--post-update-token='.length,
)

function main(): void {
  const configPath = resolve(portableRoot, 'browser-config.json')
  const chromium = resolve(portableRoot, 'browser', 'chrome.exe')
  const updater = resolve(portableRoot, 'DBKangUpdater.exe')
  const extension = resolve(portableRoot, 'extension')
  const userData = resolve(portableRoot, 'user-data')
  if (process.argv.includes('--self-test')) {
    process.exitCode = existsSync(configPath) && existsSync(chromium) && existsSync(extension) ? 0 : 2
    return
  }
  if (!existsSync(configPath) || !existsSync(chromium) || !existsSync(extension)) {
    showMessage('便携包不完整：缺少 Chromium、配置或内置扩展。请重新运行安装包。', '阿康浏览器', true)
    process.exitCode = 2
    return
  }
  const config = readJson<BrowserConfig>(configPath)
  mkdirSync(userData, { recursive: true })

  if (!skipUpdate && existsSync(updater)) {
    const update = spawnSync(updater, ['check', `--launcher-pid=${process.pid}`], {
      cwd: portableRoot,
      windowsHide: true,
      stdio: 'ignore',
    })
    if (update.status === 20) return
  }

  const child = spawn(
    chromium,
    [
      `--user-data-dir=${userData}`,
      `--disk-cache-dir=${resolve(userData, 'Cache')}`,
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      '--disable-background-mode',
      '--disable-breakpad',
      '--disable-component-update',
      '--disable-crash-reporter',
      '--no-service-autorun',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-session-crashed-bubble',
      '--new-window',
      config.homePage || 'https://i.chaoxing.com/',
    ],
    { cwd: portableRoot, windowsHide: true, stdio: 'ignore' },
  )

  let updateConfirmed = false
  let confirmationTimer: NodeJS.Timeout | undefined
  if (updateToken) {
    confirmationTimer = setTimeout(() => {
      if (child.exitCode === null) {
        const marker = resolve(portableRoot, '.update', `success-${updateToken}`)
        mkdirSync(dirname(marker), { recursive: true })
        writeFileSync(marker, new Date().toISOString())
        updateConfirmed = true
      }
    }, 10_000)
  }

  child.once('error', (error) => {
    if (confirmationTimer) clearTimeout(confirmationTimer)
    showMessage(`Chromium 启动失败：${error.message}`, '阿康浏览器', true)
    process.exitCode = 3
  })
  child.once('exit', (code) => {
    if (confirmationTimer && !updateConfirmed) clearTimeout(confirmationTimer)
    process.exitCode = code || 0
  })
}

main()
