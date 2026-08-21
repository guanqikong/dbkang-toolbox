import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import {
  compareVersions,
  copyPortableFile,
  filesNeedingUpdate,
  type BrowserConfig,
  type BrowserManifest,
  type LatestRelease,
  isManagedPortablePath,
  listFiles,
  loadUpdateState,
  markBadVersion,
  randomToken,
  readJson,
  removePortableFile,
  safeResolve,
  sha256Bytes,
  sha256File,
  writeJson,
} from './common'
import { confirmUpdate, expandArchive, showMessage } from './windows'

interface UpdatePlan {
  token: string
  portableRoot: string
  launcherPid: number
  latest: LatestRelease
}

async function main(): Promise<void> {
  const command = process.argv[2]
  if (command === '--self-test') return
  if (command === 'check') await checkForUpdate()
  else if (command === 'apply') await applyUpdate()
  else process.exitCode = 2
}

async function checkForUpdate(): Promise<void> {
  const portableRoot = dirname(process.execPath)
  const config = readJson<BrowserConfig>(resolve(portableRoot, 'browser-config.json'))
  let latest: LatestRelease
  try {
    latest = await fetchJson<LatestRelease>(config.feedUrl)
  } catch {
    return
  }
  const state = loadUpdateState(portableRoot)
  if (compareVersions(latest.version, config.version) <= 0 || state.badVersions.includes(latest.version)) return
  if (!confirmUpdate(latest.version)) return

  const token = randomToken()
  const runnerDirectory = resolve(portableRoot, '.update', `runner-${token}`)
  mkdirSync(runnerDirectory, { recursive: true })
  const runner = resolve(runnerDirectory, 'DBKangUpdater.exe')
  const launcherPid = Number.parseInt(
    process.argv.find((value) => value.startsWith('--launcher-pid='))?.slice('--launcher-pid='.length) || '0',
    10,
  )
  writeFileSync(runner, readFileSync(process.execPath))
  writeJson(resolve(runnerDirectory, 'plan.json'), { token, portableRoot, launcherPid, latest } satisfies UpdatePlan)
  const child = spawn(runner, ['apply', `--portable-root=${portableRoot}`], {
    cwd: runnerDirectory,
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
  })
  child.unref()
  process.exitCode = 20
}

async function applyUpdate(): Promise<void> {
  const runnerDirectory = dirname(process.execPath)
  const plan = readJson<UpdatePlan>(resolve(runnerDirectory, 'plan.json'))
  const root = plan.portableRoot
  await waitForProcessExit(plan.launcherPid, 30_000)

  const updateRoot = resolve(root, '.update', `apply-${plan.token}`)
  const staging = resolve(updateRoot, 'staging')
  const backup = resolve(updateRoot, 'backup')
  mkdirSync(staging, { recursive: true })
  mkdirSync(backup, { recursive: true })

  let manifest: BrowserManifest | null = null
  let backedUp: string[] = []
  let previouslyExisting = new Set<string>()
  try {
    const manifestBytes = await fetchBytes(plan.latest.manifestUrl)
    if (sha256Bytes(manifestBytes) !== plan.latest.manifestSha256) throw new Error('更新清单 SHA-256 校验失败')
    manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8')) as BrowserManifest
    if (manifest.version !== plan.latest.version) throw new Error('更新清单版本不一致')

    let changed: string[]
    try {
      changed = await stageDifferential(root, staging, manifest, plan.latest.manifestUrl)
    } catch {
      rmSync(staging, { recursive: true, force: true })
      mkdirSync(staging, { recursive: true })
      await stageFullPackage(staging, manifest, plan.latest.manifestUrl, updateRoot)
      changed = manifest.files.map((file) => file.path)
    }

    const previousManifestPath = resolve(root, 'installed-manifest.json')
    const previousFiles = existsSync(previousManifestPath)
      ? readJson<BrowserManifest>(previousManifestPath).files.map((file) => file.path)
      : listFiles(root, ['user-data', '.update']).filter(isManagedPortablePath)
    const managed = [...new Set([...previousFiles, ...manifest.files.map((file) => file.path), 'installed-manifest.json'])]
    previouslyExisting = new Set(managed.filter((portablePath) => existsSync(safeResolve(root, portablePath))))
    backedUp = [...previouslyExisting]
    for (const portablePath of backedUp) copyPortableFile(root, backup, portablePath)

    const targetPaths = new Set(manifest.files.map((file) => file.path))
    for (const portablePath of previousFiles) {
      if (!targetPaths.has(portablePath)) removePortableFile(root, portablePath)
    }
    for (const portablePath of changed) copyPortableFile(staging, root, portablePath)
    verifyInstallation(root, manifest)
    writeJson(resolve(root, 'installed-manifest.json'), manifest)
    const configPath = resolve(root, 'browser-config.json')
    const config = readJson<BrowserConfig>(configPath)
    config.version = manifest.version
    config.chromiumVersion = manifest.chromiumVersion
    writeJson(configPath, config)

    const marker = resolve(root, '.update', `success-${plan.token}`)
    const launcher = resolve(root, 'DBKangBrowser.exe')
    spawn(launcher, ['--skip-update', `--post-update-token=${plan.token}`], {
      cwd: root,
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    }).unref()
    if (!(await waitForFile(marker, 45_000))) throw new Error('新版本未能通过启动确认')
    rmSync(updateRoot, { recursive: true, force: true })
  } catch (error) {
    if (manifest) {
      for (const file of manifest.files) {
        if (!previouslyExisting.has(file.path)) removePortableFile(root, file.path)
      }
    }
    for (const portablePath of backedUp) copyPortableFile(backup, root, portablePath)
    markBadVersion(root, plan.latest.version)
    showMessage(`更新失败，已回滚到上一版本。\n${error instanceof Error ? error.message : String(error)}`, '阿康浏览器更新', true)
    const launcher = resolve(root, 'DBKangBrowser.exe')
    if (existsSync(launcher)) {
      spawn(launcher, ['--skip-update'], { cwd: root, detached: true, windowsHide: true, stdio: 'ignore' }).unref()
    }
  }
}

async function stageDifferential(
  root: string,
  staging: string,
  manifest: BrowserManifest,
  manifestUrl: string,
): Promise<string[]> {
  const changed = filesNeedingUpdate(root, manifest.files)
  await concurrentMap(changed, 8, async (file) => {
    const bytes = await fetchBytes(new URL(file.url, manifestUrl).href)
    if (sha256Bytes(bytes) !== file.sha256) throw new Error(`差分文件校验失败：${file.path}`)
    const target = safeResolve(staging, file.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, bytes)
  })
  return changed.map((file) => file.path)
}

async function stageFullPackage(
  staging: string,
  manifest: BrowserManifest,
  manifestUrl: string,
  updateRoot: string,
): Promise<void> {
  const bytes = await fetchBytes(new URL(manifest.full.url, manifestUrl).href)
  if (sha256Bytes(bytes) !== manifest.full.sha256) throw new Error('完整包 SHA-256 校验失败')
  const archive = resolve(updateRoot, 'full.zip')
  writeFileSync(archive, bytes)
  expandArchive(archive, staging)
  verifyInstallation(staging, manifest)
}

function verifyInstallation(root: string, manifest: BrowserManifest): void {
  for (const file of manifest.files) {
    const target = safeResolve(root, file.path)
    if (!existsSync(target) || sha256File(target) !== file.sha256) {
      throw new Error(`安装文件校验失败：${file.path}`)
    }
  }
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function fetchJson<T>(url: string): Promise<T> {
  return JSON.parse(Buffer.from(await fetchBytes(url)).toString('utf8')) as T
}

async function waitForFile(path: string, timeout: number): Promise<boolean> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (existsSync(path)) return true
    await delay(500)
  }
  return false
}

async function waitForProcessExit(pid: number, timeout: number): Promise<void> {
  if (!pid) return
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    } catch {
      return
    }
    await delay(250)
  }
  throw new Error('启动器未能按时退出')
}

async function concurrentMap<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(items.length, concurrency) }, async () => {
      while (cursor < items.length) await task(items[cursor++]!)
    }),
  )
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

void main().catch((error) => {
  showMessage(`更新器发生错误：${error instanceof Error ? error.message : String(error)}`, '阿康浏览器更新', true)
  process.exitCode = 1
})
