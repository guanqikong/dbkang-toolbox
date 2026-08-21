import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { getAsset } from 'node:sea'
import {
  compareVersions,
  copyPortableFile,
  type BrowserConfig,
  type BrowserManifest,
  isManagedPortablePath,
  listFiles,
  randomToken,
  readJson,
  removePortableFile,
  safeResolve,
  sha256Bytes,
  sha256File,
  writeJson,
} from './common'
import { expandArchive, showMessage } from './windows'

function main(): void {
  if (process.argv.includes('--self-test')) {
    const archiveBytes = new Uint8Array(getAsset('portable.zip'))
    const embeddedManifest = JSON.parse(
      Buffer.from(getAsset('manifest.json')).toString('utf8'),
    ) as BrowserManifest
    if (sha256Bytes(archiveBytes) !== embeddedManifest.full.sha256) {
      throw new Error('内嵌完整包校验失败')
    }
    return
  }
  const destination = resolve(dirname(process.execPath), 'DBKangBrowser')
  const work = resolve(tmpdir(), `DBKangBrowser-${randomToken()}`)
  const staging = resolve(work, 'staging')
  const backup = resolve(work, 'backup')
  mkdirSync(staging, { recursive: true })
  mkdirSync(backup, { recursive: true })

  const archive = resolve(work, 'portable.zip')
  writeFileSync(archive, Buffer.from(getAsset('portable.zip')))
  const manifest = JSON.parse(Buffer.from(getAsset('manifest.json')).toString('utf8')) as BrowserManifest
  expandArchive(archive, staging)
  verify(staging, manifest)

  const existingConfigPath = resolve(destination, 'browser-config.json')
  if (existsSync(existingConfigPath)) {
    const existing = readJson<BrowserConfig>(existingConfigPath)
    if (compareVersions(existing.version, manifest.version) > 0) {
      showMessage(`当前已安装 ${existing.version}，安装包 ${manifest.version} 较旧，已拒绝降级。`)
      return
    }
  }

  mkdirSync(destination, { recursive: true })
  const previousManifestPath = resolve(destination, 'installed-manifest.json')
  const previousFiles = existsSync(previousManifestPath)
    ? readJson<BrowserManifest>(previousManifestPath).files.map((file) => file.path)
    : listFiles(destination, ['user-data', '.update']).filter(isManagedPortablePath)
  const targetPaths = new Set(manifest.files.map((file) => file.path))
  const managed = [...new Set([...previousFiles, ...targetPaths, 'installed-manifest.json'])]
  const existed = new Set(managed.filter((portablePath) => existsSync(safeResolve(destination, portablePath))))
  for (const portablePath of existed) copyPortableFile(destination, backup, portablePath)

  try {
    for (const portablePath of previousFiles) {
      if (!targetPaths.has(portablePath)) removePortableFile(destination, portablePath)
    }
    for (const file of manifest.files) copyPortableFile(staging, destination, file.path)
    verify(destination, manifest)
    writeJson(previousManifestPath, manifest)
  } catch (error) {
    for (const file of manifest.files) {
      if (!existed.has(file.path)) removePortableFile(destination, file.path)
    }
    for (const portablePath of existed) copyPortableFile(backup, destination, portablePath)
    throw error
  } finally {
    rmSync(work, { recursive: true, force: true })
  }

  const launcher = resolve(destination, 'DBKangBrowser.exe')
  spawn(launcher, ['--skip-update'], {
    cwd: destination,
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
  }).unref()
}

function verify(root: string, manifest: BrowserManifest): void {
  for (const file of manifest.files) {
    const target = safeResolve(root, file.path)
    if (!existsSync(target) || sha256File(target) !== file.sha256) {
      throw new Error(`安装文件 SHA-256 校验失败：${file.path}`)
    }
  }
}

try {
  main()
} catch (error) {
  showMessage(`安装失败，已保留原有用户数据。\n${error instanceof Error ? error.message : String(error)}`, '阿康浏览器安装', true)
  process.exitCode = 1
}
