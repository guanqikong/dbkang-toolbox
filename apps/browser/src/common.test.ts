import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  filesNeedingUpdate,
  isManagedPortablePath,
  listFiles,
  safeResolve,
  sha256File,
} from './common'

describe('portable browser common helpers', () => {
  it('compares release versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1)
    expect(compareVersions('v2.0.0', '2.0.0')).toBe(0)
    expect(compareVersions('0.9.0', '1.0.0')).toBe(-1)
  })

  it('rejects paths escaping the portable root', () => {
    expect(() => safeResolve('/tmp/root', '../outside')).toThrow(/不安全/)
    expect(safeResolve('/tmp/root', 'browser/chrome.exe')).toContain('browser/chrome.exe')
  })

  it('never treats user state as a managed program file', () => {
    expect(isManagedPortablePath('browser/chrome.exe')).toBe(true)
    expect(isManagedPortablePath('extension/manifest.json')).toBe(true)
    expect(isManagedPortablePath('user-data/Default/Cookies')).toBe(false)
    expect(isManagedPortablePath('update-state.json')).toBe(false)
    expect(isManagedPortablePath('学生自己的文件.txt')).toBe(false)
  })

  it('lists and hashes managed files while excluding user-data', () => {
    const root = resolve(tmpdir(), `dbkang-browser-test-${Date.now()}`)
    mkdirSync(resolve(root, 'browser'), { recursive: true })
    mkdirSync(resolve(root, 'user-data'), { recursive: true })
    writeFileSync(resolve(root, 'browser/chrome.exe'), 'chromium')
    writeFileSync(resolve(root, 'user-data/Cookies'), 'private')
    expect(listFiles(root, ['user-data'])).toEqual(['browser/chrome.exe'])
    expect(sha256File(resolve(root, 'browser/chrome.exe'))).toHaveLength(64)

    const changed = filesNeedingUpdate(root, [
      {
        path: 'browser/chrome.exe',
        sha256: sha256File(resolve(root, 'browser/chrome.exe')),
        size: 8,
        url: 'chrome.exe',
      },
      { path: 'extension/manifest.json', sha256: '0'.repeat(64), size: 1, url: 'manifest.json' },
    ])
    expect(changed.map((file) => file.path)).toEqual(['extension/manifest.json'])
  })
})
