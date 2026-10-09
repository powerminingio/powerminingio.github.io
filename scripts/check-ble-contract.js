/*
 * Assert src/lib/ble-config.ts matches the firmware's GATT contract.
 *
 * The UUIDs and length limits are a wire contract with pm-miner's
 * components/bluetooth. If they drift, nothing else about the configurator
 * matters, so this reads the firmware headers directly rather than trusting a
 * transcription. Re-run it whenever pm-miner changes.
 *
 *   node scripts/check-ble-contract.js [path-to-pm-miner]
 */
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const FW = process.argv[2] || '/mnt/c/Users/raivi/Documents/pm-miner'
const BT = path.join(FW, 'components', 'bluetooth')

if (!fs.existsSync(BT)) {
  console.log(`SKIP  firmware not available at ${FW}`)
  process.exit(0)
}

const cpp = fs.readFileSync(path.join(BT, 'setup_ble_service.cpp'), 'utf8')
const hdr = fs.readFileSync(path.join(BT, 'setup_ble_protocol.h'), 'utf8')

// NimBLE's BLE_UUID128_INIT lists the 16 bytes least-significant first.
const uuidFromInit = (body) => {
  const b = [...body.matchAll(/0x([0-9a-fA-F]{2})/g)].map((m) => m[1].toLowerCase())
  if (b.length !== 16) throw new Error(`expected 16 bytes, got ${b.length}`)
  const s = b.reverse().join('')
  return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20,32)}`
}

const fwService = uuidFromInit(/SERVICE_UUID\s*=\s*BLE_UUID128_INIT\(([\s\S]*?)\);/.exec(cpp)[1])
const charBlock = /CHARACTERISTIC_UUIDS\[[^\]]*\]\s*=\s*\{([\s\S]*?)\n\};/.exec(cpp)[1]
const fwChars = [...charBlock.matchAll(/BLE_UUID128_INIT\(([\s\S]*?)\)/g)].map((m) => uuidFromInit(m[1]))

const enumBlock = /enum class SetupBleField[^{]*\{([\s\S]*?)\};/.exec(hdr)[1]
const fwFieldOrder = [...enumBlock.matchAll(/^\s*([A-Z_]+)/gm)].map((m) => m[1]).filter((n) => n !== 'COUNT')

const fwLen = {}
for (const m of hdr.matchAll(/SETUP_BLE_(MAX_\w+|STATUS_LEN)\s*=\s*(\d+)U/g)) fwLen[m[1]] = Number(m[2])

// Load our constants out of the real module.
const src = fs.readFileSync('src/lib/ble-config.ts', 'utf8')
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const mod = { exports: {} }
new Function('module', 'exports', 'navigator', js)(mod, mod.exports, { bluetooth: {} })
const { SERVICE_UUID, FIELDS, FIELD_ORDER, KNOWN_STATUSES } = mod.exports
// Not exported, so read them back out of the source.
const [SCAN_CONTROL_UUID, SCAN_RESULT_UUID] =
  [...new Set([...src.matchAll(/6a6a30b6-[0-9a-f-]+/g)].map((m) => m[0]))].sort()

let bad = 0
const check = (name, ok, detail = '') => {
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

check('service UUID matches firmware', SERVICE_UUID === fwService, fwService)

// Firmware enum order -> our camelCase field names.
const NAME_MAP = {
  WIFI_SSID: 'wifiSsid', WIFI_PASSWORD: 'wifiPassword', POOL_URL: 'poolUrl',
  POOL_PORT: 'poolPort', POOL_USER: 'poolUser', POOL_PASSWORD: 'poolPassword',
  STATUS: null, COMMAND: null,
}
const LEN_MAP = {
  wifiSsid: 'MAX_SSID_LEN', wifiPassword: 'MAX_WIFI_PASSWORD_LEN',
  poolUrl: 'MAX_POOL_URL_LEN', poolPort: 'MAX_POOL_PORT_LEN',
  poolUser: 'MAX_POOL_USER_LEN', poolPassword: 'MAX_POOL_PASSWORD_LEN',
}

check('firmware exposes 8 characteristics', fwChars.length === 8, `got ${fwChars.length}`)
check('field enum order is as expected', fwFieldOrder.length === 8)

fwFieldOrder.forEach((fwName, i) => {
  const ours = NAME_MAP[fwName]
  if (ours === null) return // STATUS and COMMAND are internal to the module
  check(`${fwName} UUID`, FIELDS[ours] && FIELDS[ours].uuid === fwChars[i], fwChars[i])
  check(`${fwName} max length`, FIELDS[ours] && FIELDS[ours].maxBytes === fwLen[LEN_MAP[ours]],
        `firmware ${fwLen[LEN_MAP[ours]]}`)
})

// The two characteristics the module keeps private still have to line up.
const statusIdx = fwFieldOrder.indexOf('STATUS')
const cmdIdx = fwFieldOrder.indexOf('COMMAND')
check('STATUS is the 7th characteristic', statusIdx === 6)
check('COMMAND is the 8th characteristic', cmdIdx === 7)
check('our writable field order matches firmware',
      JSON.stringify(FIELD_ORDER) === JSON.stringify(fwFieldOrder.slice(0, 6).map((n) => NAME_MAP[n])))

// Every status constant the firmware defines must be one we can translate.
const fwStatuses = [...hdr.matchAll(/SETUP_BLE_STATUS_\w+\s*=\s*"([A-Z_]+)"/g)].map((m) => m[1])
const missing = fwStatuses.filter((s) => !KNOWN_STATUSES.includes(s))
check(`all ${fwStatuses.length} firmware status strings are known`, missing.length === 0, missing.join(', '))

// --- Wi-Fi scan extension (PM-specific; see pm-miner/docs/BLE_WIFI_SCAN.md) ---
// Until the firmware implements it, the note is the only source of truth. Once
// setup_ble_service.cpp carries these UUIDs, prefer them over the note.
const NOTE = path.join(FW, 'docs', 'BLE_WIFI_SCAN.md')
if (fs.existsSync(NOTE)) {
  const note = fs.readFileSync(NOTE, 'utf8')
  const inCpp = [...cpp.matchAll(/6a6a30b6-[0-9a-f-]+/g)].map((m) => m[0])
  const spec = [...new Set([...note.matchAll(/6a6a30b6-[0-9a-f-]+/g)].map((m) => m[0]))].sort()
  const source = inCpp.length ? 'setup_ble_service.cpp' : 'BLE_WIFI_SCAN.md'

  check(`scan UUIDs documented (${source})`, spec.length === 2, spec.join(', '))
  check('scan control UUID matches client', SCAN_CONTROL_UUID === spec[0], spec[0])
  check('scan result UUID matches client', SCAN_RESULT_UUID === spec[1], spec[1])
  check('scan UUIDs do not collide with the setup service', !spec.includes(fwService))
  check('scan UUIDs do not extend the upstream char base',
        !spec.some((u) => u.startsWith('beb5483e')))
  if (inCpp.length) {
    check('firmware implements both scan characteristics', new Set(inCpp).size === 2)
  } else {
    console.log('NOTE  firmware has not implemented the scan extension yet (client degrades via NotFoundError)')
  }
}

console.log(bad ? `\n${bad} FAILED` : `\ncontract matches firmware (${fwChars.length} characteristics, ${fwStatuses.length} statuses)`)
process.exit(bad ? 1 : 0)
