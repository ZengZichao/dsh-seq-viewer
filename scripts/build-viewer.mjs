import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const viewerApp = path.join(root, 'viewer-app')

const isWindows = process.platform === 'win32'
const result = spawnSync(isWindows ? 'npm.cmd' : 'npm', ['run', 'build:singlefile'], {
  cwd: viewerApp,
  stdio: 'inherit',
  shell: isWindows,
  env: { ...process.env, DSH_SEQ_VIEWER_SINGLEFILE: '1' },
})
if (result.status !== 0) process.exit(result.status ?? 1)

const embed = spawnSync(process.execPath, [path.join(root, 'scripts/build-client.mjs')], {
  cwd: root,
  stdio: 'inherit',
})
process.exit(embed.status ?? 0)
