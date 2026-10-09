/*
 * Unit tests for the Wi-Fi scan wire format in src/lib/ble-config.ts.
 *
 * The entry format puts the SSID last and unescaped, so a comma in a network
 * name is legal; these tests pin that and the other awkward cases called out in
 * pm-miner/docs/BLE_WIFI_SCAN.md.
 *
 *   node scripts/check-ble-scan-parsing.js
 */
const ts = require('typescript')
const fs = require('fs')

const js = ts.transpileModule(fs.readFileSync('src/lib/ble-config.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const mod = { exports: {} }
new Function('module', 'exports', 'navigator', js)(mod, mod.exports, { bluetooth: {} })
const { parseScanState, parseNetworkEntry, parseNetworkEntries } = mod.exports

let bad = 0
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`)
}

console.log('— scan state line')
eq('done with age',      parseScanState('DONE,7,3'),        { state: 'DONE', count: 7, ageSeconds: 3 })
eq('scanning, no age',   parseScanState('SCANNING,0,-'),    { state: 'SCANNING', count: 0, ageSeconds: null })
eq('idle',               parseScanState('IDLE,0,-'),        { state: 'IDLE', count: 0, ageSeconds: null })
eq('throttled keeps cache', parseScanState('THROTTLED,5,12'), { state: 'THROTTLED', count: 5, ageSeconds: 12 })
eq('unavailable',        parseScanState('UNAVAILABLE,0,-'), { state: 'UNAVAILABLE', count: 0, ageSeconds: null })
eq('unknown state passes through', parseScanState('SOMETHING_NEW,2,1'), { state: 'SOMETHING_NEW', count: 2, ageSeconds: 1 })
eq('truncated line is tolerated',  parseScanState('DONE'),  { state: 'DONE', count: 0, ageSeconds: null })
eq('empty line is tolerated',      parseScanState(''),      { state: '', count: 0, ageSeconds: null })
eq('whitespace trimmed',           parseScanState(' DONE,1,0 \n'), { state: 'DONE', count: 1, ageSeconds: 0 })

console.log('\n— network entry')
eq('plain',        parseNetworkEntry('-54,3,6,HomeNet'),   { ssid: 'HomeNet', rssi: -54, auth: 3, channel: 6 })
eq('open network', parseNetworkEntry('-70,0,11,Cafe WiFi'),{ ssid: 'Cafe WiFi', rssi: -70, auth: 0, channel: 11 })
eq('SSID containing commas', parseNetworkEntry('-61,4,1,Bob, Alice and Co'),
   { ssid: 'Bob, Alice and Co', rssi: -61, auth: 4, channel: 1 })
eq('SSID that is only commas', parseNetworkEntry('-61,4,1,,,'), { ssid: ',,', rssi: -61, auth: 4, channel: 1 })
eq('UTF-8 SSID',   parseNetworkEntry('-48,3,6,Мой Wi-Fi 🛜'), { ssid: 'Мой Wi-Fi 🛜', rssi: -48, auth: 3, channel: 6 })
eq('hidden (empty SSID) dropped', parseNetworkEntry('-80,3,2,'), null)
eq('too few fields dropped',      parseNetworkEntry('-54,3,HomeNet'), null)
eq('non-numeric rssi dropped',    parseNetworkEntry('x,3,6,HomeNet'), null)
eq('empty line dropped',          parseNetworkEntry(''), null)

console.log('\n— batch')
eq('multi-line batch', parseNetworkEntries('-40,3,1,A\n-55,0,6,B\n-70,4,11,C').map((n) => n.ssid), ['A', 'B', 'C'])
eq('hidden rows filtered out', parseNetworkEntries('-40,3,1,A\n-80,3,2,\n-70,4,11,C').map((n) => n.ssid), ['A', 'C'])
eq('malformed rows filtered out', parseNetworkEntries('-40,3,1,A\ngarbage\n-70,4,11,C').map((n) => n.ssid), ['A', 'C'])
eq('trailing newline', parseNetworkEntries('-40,3,1,A\n').map((n) => n.ssid), ['A'])
eq('empty read', parseNetworkEntries(''), [])
eq('signal order preserved (firmware sorts)', parseNetworkEntries('-40,3,1,A\n-90,3,1,B').map((n) => n.rssi), [-40, -90])

console.log(bad ? `\n${bad} FAILED` : '\nall scan parsing assertions passed')
process.exit(bad ? 1 : 0)
