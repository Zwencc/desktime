import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const root = resolve(scriptsDir, '..')
const tauriDir = join(root, 'src-tauri')
const release = process.argv.includes('--release')

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: 'inherit', env })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const rustc = spawnSync('rustc', ['-vV'], { cwd: root, encoding: 'utf8' })
if (rustc.status !== 0) process.exit(rustc.status ?? 1)
const host = rustc.stdout.match(/^host:\s*(.+)$/m)?.[1]?.trim()
if (!host) throw new Error('rustc did not report its host target')

const cargoArgs = [
  'build',
  '--manifest-path', join(tauriDir, 'Cargo.toml'),
  '--bin', 'DTCore',
  '--bin', 'DTSvc',
]
if (release) cargoArgs.push('--release')
run('cargo', cargoArgs, {
  ...process.env,
  // Building the sidecars is what creates externalBin. Suppress that bundle
  // check for this bootstrap build only; the real Tauri build still validates
  // and packages the copied target-suffixed files below.
  TAURI_CONFIG: JSON.stringify({ bundle: { externalBin: [] } }),
})

const profile = release ? 'release' : 'debug'
const extension = process.platform === 'win32' ? '.exe' : ''
const binariesDir = join(tauriDir, 'binaries')
mkdirSync(binariesDir, { recursive: true })

for (const name of ['DTCore', 'DTSvc']) {
  const source = join(tauriDir, 'target', profile, `${name}${extension}`)
  const target = join(binariesDir, `${name}-${host}${extension}`)
  copyFileSync(source, target)
  console.log(`${name}: ${target}`)
}
