import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const adapterPath = resolve(root, 'resources/adapters/telegram.adapt')
const ROTE_BIN = process.env.ROTE_BIN || 'rote'
const ADAPTER_ID = 'telegram'
const TOKEN_ENV = 'TELEGRAM_BOT_TOKEN'

function loadEnvFile(path) {
  if (!existsSync(path)) return
  const src = readFileSync(path, 'utf8')
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}

loadEnvFile(resolve(root, '.env'))

const TOKEN_VALUE = process.env[TOKEN_ENV]
if (!TOKEN_VALUE) {
  console.error(
    `[bootstrap-rote] ${TOKEN_ENV} not set — add it to .env (see .env.example)`
  )
  process.exit(1)
}

function run(args, { capture = false } = {}) {
  const res = spawnSync(ROTE_BIN, args, {
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8'
  })
  return res
}

function rotePresent() {
  const res = spawnSync(ROTE_BIN, ['--version'], { stdio: 'ignore' })
  return res.status === 0 || res.error === undefined
}

function adapterInstalled() {
  const res = run(['adapter', 'info', ADAPTER_ID], { capture: true })
  return res.status === 0
}

function installAdapter() {
  if (!existsSync(adapterPath)) {
    console.error(`[bootstrap-rote] adapter archive missing: ${adapterPath}`)
    process.exit(1)
  }
  const res = run(['adapter', 'install', adapterPath])
  if (res.status !== 0) {
    console.error(`[bootstrap-rote] rote adapter install failed (exit ${res.status})`)
    process.exit(res.status ?? 1)
  }
}

function setToken() {
  const res = run(['token', 'set', TOKEN_ENV, TOKEN_VALUE, 'flow-build demo bot'], {
    capture: true
  })
  if (res.status !== 0) {
    console.error(`[bootstrap-rote] rote token set failed (exit ${res.status})`)
    if (res.stderr) console.error(res.stderr)
    process.exit(res.status ?? 1)
  }
}

if (!rotePresent()) {
  console.warn('[bootstrap-rote] rote CLI not on PATH — skipping demo adapter install')
  process.exit(0)
}

if (adapterInstalled()) {
  console.log(`[bootstrap-rote] adapter "${ADAPTER_ID}" already installed — skipping`)
} else {
  console.log(`[bootstrap-rote] installing adapter "${ADAPTER_ID}" from ${adapterPath}`)
  installAdapter()
}

setToken()
console.log(`[bootstrap-rote] ${TOKEN_ENV} configured`)
