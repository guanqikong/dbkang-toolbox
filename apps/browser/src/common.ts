import { createHash, randomBytes } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'

export interface BrowserFile {
  path: string
  sha256: string
  size: number
  url: string
}

export interface BrowserManifest {
  schemaVersion: 1
  version: string
  chromiumVersion: string
  files: BrowserFile[]
  full: { url: string; sha256: string; size: number }
}

export interface LatestRelease {
  schemaVersion: 1
  channel: 'stable'
  version: string
  chromiumVersion: string
  manifestUrl: string
  manifestSha256: string
}

export interface BrowserConfig {
  version: string
  chromiumVersion: string
  feedUrl: string
  homePage: string
}

export interface UpdateState {
  badVersions: string[]
}

export function compareVersions(left: string, right: string): number {
  const a = normalizeVersion(left)
  const b = normalizeVersion(right)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0)
    if (difference !== 0) return difference > 0 ? 1 : -1
  }
  return 0
}

function normalizeVersion(version: string): number[] {
  return version.replace(/^v/i, '').split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0)
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

export function filesNeedingUpdate(root: string, files: BrowserFile[]): BrowserFile[] {
  return files.filter((file) => {
    const current = safeResolve(root, file.path)
    return !existsSync(current) || sha256File(current) !== file.sha256
  })
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

export function safeResolve(root: string, portablePath: string): string {
  const normalized = portablePath.replaceAll('\\', '/')
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error(`不安全的包路径：${portablePath}`)
  }
  const target = resolve(root, ...normalized.split('/'))
  const prefix = resolve(root) + sep
  if (target !== resolve(root) && !target.startsWith(prefix)) throw new Error(`路径越界：${portablePath}`)
  return target
}

export function listFiles(root: string, exclusions: string[] = []): string[] {
  if (!existsSync(root)) return []
  const excluded = exclusions.map((item) => item.replaceAll('\\', '/').replace(/\/$/, ''))
  const files: string[] = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name)
      const portable = relative(root, absolute).split(sep).join('/')
      if (excluded.some((item) => portable === item || portable.startsWith(`${item}/`))) continue
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile()) files.push(portable)
    }
  }
  visit(root)
  return files.sort()
}

export function isManagedPortablePath(portablePath: string): boolean {
  return (
    portablePath === 'DBKangBrowser.exe' ||
    portablePath === 'DBKangUpdater.exe' ||
    portablePath === 'browser-config.json' ||
    portablePath === '使用说明.txt' ||
    portablePath.startsWith('browser/') ||
    portablePath.startsWith('extension/')
  )
}

export function copyPortableFile(sourceRoot: string, targetRoot: string, portablePath: string): void {
  const source = safeResolve(sourceRoot, portablePath)
  const target = safeResolve(targetRoot, portablePath)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(source, target)
}

export function copyTree(sourceRoot: string, targetRoot: string, exclusions: string[] = []): void {
  for (const portablePath of listFiles(sourceRoot, exclusions)) {
    copyPortableFile(sourceRoot, targetRoot, portablePath)
  }
}

export function removePortableFile(root: string, portablePath: string): void {
  const target = safeResolve(root, portablePath)
  if (existsSync(target) && statSync(target).isFile()) rmSync(target, { force: true })
}

export function randomToken(): string {
  return `${Date.now()}-${randomBytes(8).toString('hex')}`
}

export function loadUpdateState(root: string): UpdateState {
  const statePath = resolve(root, 'update-state.json')
  if (!existsSync(statePath)) return { badVersions: [] }
  try {
    const state = readJson<UpdateState>(statePath)
    return { badVersions: Array.isArray(state.badVersions) ? state.badVersions : [] }
  } catch {
    return { badVersions: [] }
  }
}

export function markBadVersion(root: string, version: string): void {
  const state = loadUpdateState(root)
  state.badVersions = [...new Set([...state.badVersions, version])]
  writeJson(resolve(root, 'update-state.json'), state)
}
