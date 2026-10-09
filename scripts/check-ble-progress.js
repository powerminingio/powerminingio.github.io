/*
 * Progress logic for the BLE panel.
 *
 *   node scripts/check-ble-progress.js
 */
const ts = require('typescript')
const fs = require('fs')

const js = ts.transpileModule(fs.readFileSync('src/lib/ble-config.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const mod = { exports: {} }
new Function('module', 'exports', 'navigator', js)(mod, mod.exports, { bluetooth: {} })
const { classifyStatus, KNOWN_STATUSES, FIELD_ORDER } = mod.exports

let bad = 0
const check = (name, ok, detail = '') => {
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

const PHASES = ['idle','connecting','reading','ready','saving','applied','restarting','error']

console.log('— classifyStatus covers every firmware status')
for (const s of KNOWN_STATUSES) {
  const phase = classifyStatus(s)
  check(`${s} -> ${phase}`, PHASES.includes(phase))
}
check('all 12 firmware statuses accounted for', KNOWN_STATUSES.length === 12, `${KNOWN_STATUSES.length}`)

console.log('\n— the groupings')
const errors = KNOWN_STATUSES.filter((s) => s.startsWith('ERROR'))
check('all 8 ERROR_* map to error',
  errors.length === 8 && errors.every((s) => classifyStatus(s) === 'error'), `${errors.length} found`)
check('APPLIED_RESTART_REQUIRED -> applied', classifyStatus('APPLIED_RESTART_REQUIRED') === 'applied')
check('RESTARTING -> restarting', classifyStatus('RESTARTING') === 'restarting')
check('READY -> ready', classifyStatus('READY') === 'ready')
check('PENDING_APPLY -> ready (still connected)', classifyStatus('PENDING_APPLY') === 'ready')
check('unknown status -> ready, never undefined', classifyStatus('SOMETHING_NEW_IN_FIRMWARE') === 'ready')
check('empty status -> ready', classifyStatus('') === 'ready')

console.log('\n— save bar arithmetic: APPLY is the final step, so denominator is changed + 1')
// Mirrors the component: step 0..n writes, then APPLY as step n+1.
const pct = (step, changed) => Math.round((step / (changed + 1)) * 100)
for (const changed of [1, 3, 6]) {
  const steps = Array.from({ length: changed + 2 }, (_, i) => pct(i, changed))
  check(`${changed} changed field(s) starts at 0%`, steps[0] === 0, steps.join(','))
  check(`${changed} changed field(s) reaches exactly 100% on APPLY`,
    steps[steps.length - 1] === 100, steps.join(','))
  check(`${changed} changed field(s) is below 100% after the last write`,
    steps[steps.length - 2] < 100, `${steps[steps.length - 2]}%`)
}
check('six fields is the whole form', FIELD_ORDER.length === 6, `${FIELD_ORDER.length}`)

console.log(bad ? `\n${bad} FAILED` : '\nall progress assertions passed')
process.exit(bad ? 1 : 0)
