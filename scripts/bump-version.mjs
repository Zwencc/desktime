// Bumps the patch version, once per production build.
//
// The version lives in three files and they had drifted apart (0.1.0 / 0.0.0 /
// 0.1.0). tauri.conf.json is the one `getVersion()` reads, so it is the source
// of truth here and the other two are made to follow it.
//
// Only `tauri:build` runs this. `npm run build` and `tauri:dev` deliberately do
// not: a day of rebuilding would otherwise push the patch number into the
// hundreds and every one of those numbers would mean nothing.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tauriConf = join(root, 'src-tauri', 'tauri.conf.json')
const packageJson = join(root, 'package.json')
const cargoToml = join(root, 'src-tauri', 'Cargo.toml')

const conf = readFileSync(tauriConf, 'utf8')
const current = conf.match(/"version":\s*"(\d+)\.(\d+)\.(\d+)"/)
if (!current) {
  throw new Error(`no "version": "x.y.z" found in ${tauriConf}`)
}

const [, major, minor, patch] = current
const next = `${major}.${minor}.${Number(patch) + 1}`

// Each file is rewritten by replacing its first version string in place. A JSON
// round-trip would reformat every line of a hand-formatted file, and the Cargo
// manifest has no round-trip at all — its `[package]` version is simply the
// first line-anchored `version =` in the file.
writeFileSync(tauriConf, conf.replace(/"version":\s*"[^"]*"/, `"version": "${next}"`))

const pkg = readFileSync(packageJson, 'utf8')
writeFileSync(packageJson, pkg.replace(/"version":\s*"[^"]*"/, `"version": "${next}"`))

const cargo = readFileSync(cargoToml, 'utf8')
writeFileSync(cargoToml, cargo.replace(/^version = "[^"]*"/m, `version = "${next}"`))

console.log(`DeskTime ${next}`)
