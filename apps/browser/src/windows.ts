import { spawnSync } from 'node:child_process'
import process from 'node:process'

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export function showMessage(message: string, title = '阿康浏览器', error = false): void {
  const icon = error ? 'Error' : 'Information'
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    `[void][System.Windows.Forms.MessageBox]::Show(${quotePowerShell(message)},${quotePowerShell(title)},'OK','${icon}')`,
  ].join(';')
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    stdio: 'ignore',
  })
}

export function confirmUpdate(version: string): boolean {
  const message = `发现阿康浏览器 ${version}。选择“是”立即更新，选择“否”下次启动时再提醒。`
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    `$result=[System.Windows.Forms.MessageBox]::Show(${quotePowerShell(message)},'阿康浏览器更新','YesNo','Information')`,
    "if ($result -eq 'Yes') { Write-Output 'yes' } else { Write-Output 'no' }",
  ].join(';')
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    encoding: 'utf8',
  })
  return result.stdout.trim() === 'yes'
}

export function expandArchive(archive: string, destination: string): void {
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Expand-Archive -LiteralPath $env:DBKANG_ARCHIVE_PATH -DestinationPath $env:DBKANG_ARCHIVE_DESTINATION -Force',
    ],
    {
      windowsHide: true,
      encoding: 'utf8',
      env: {
        ...process.env,
        DBKANG_ARCHIVE_PATH: archive,
        DBKANG_ARCHIVE_DESTINATION: destination,
      },
    },
  )
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`压缩包解压失败：${result.stderr || 'PowerShell 未返回错误详情'}`)
}
