/*
 * Regression tests for the post-flash reset.
 *
 * The bug: esptool-js's HardReset only deasserts RTS, so EN is never pulled low
 * and the chip never reboots. Test 1 pins that our sequence produces BOTH edges
 * and would fail against the old behaviour.
 *
 *   node scripts/check-reset.js
 */
const ts = require('typescript')
const fs = require('fs')
const { CustomReset, HardReset, validateCustomResetStringSequence } = require('esptool-js')

let bad = 0
const check = (name, ok, detail = '') => {
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

// Records every control-line write, so we can see the actual waveform.
const recorder = () => {
  const rts = []
  const dtr = []
  return { rts, dtr, async setRTS(v) { rts.push(v) }, async setDTR(v) { dtr.push(v) } }
}

const load = () => {
  const js = ts.transpileModule(fs.readFileSync('src/lib/reset.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const mod = { exports: {} }
  const req = (id) => (id === 'esptool-js' ? require('esptool-js') : require(id))
  new Function('module', 'exports', 'require', 'console', js)(mod, mod.exports, req, console)
  return mod.exports
}

;(async () => {
  const { resetIntoApp } = load()

  // 1. THE regression test: the pulse must have a rising and a falling edge.
  {
    const t = recorder()
    await new CustomReset(t, 'R1|W100|R0').reset()
    check('our sequence pulses RTS both ways', JSON.stringify(t.rts) === '[true,false]', JSON.stringify(t.rts))

    const old = recorder()
    await new HardReset(old, false).reset()
    check("esptool-js HardReset only deasserts (the bug)", JSON.stringify(old.rts) === '[false]', JSON.stringify(old.rts))
    check('the two differ — fix is doing something', JSON.stringify(t.rts) !== JSON.stringify(old.rts))
  }

  // 2. The sequence string must satisfy esptool-js's own validator. A fractional
  //    delay silently no-ops, so this is load-bearing.
  {
    check("'R1|W100|R0' validates", validateCustomResetStringSequence('R1|W100|R0') === true)
    check("'R1|W0.1|R0' does NOT validate (seconds trap)", validateCustomResetStringSequence('R1|W0.1|R0') === false)
    const t = recorder()
    await new CustomReset(t, 'R1|W0.1|R0').reset()
    check('an invalid sequence silently does nothing', t.rts.length === 0, JSON.stringify(t.rts))
  }

  // 3. ESP32-S3: clears force-download-boot, then pulses.
  {
    const calls = []
    const loader = {
      chip: { CHIP_NAME: 'ESP32-S3' },
      async writeReg(...a) { calls.push(['writeReg', ...a]) },
      async after(...a) { calls.push(['after', ...a]) },
    }
    const outcome = await resetIntoApp(loader)
    check('outcome is pulse', outcome === 'pulse')
    check('clears force-download-boot first',
      JSON.stringify(calls[0]) === JSON.stringify(['writeReg', 0x6000812c, 0, 0x1]), JSON.stringify(calls[0]))
    check('then issues custom_reset with our sequence',
      JSON.stringify(calls[1]) === JSON.stringify(['after', 'custom_reset', undefined, 'R1|W100|R0']),
      JSON.stringify(calls[1]))
    check('exactly two operations', calls.length === 2)
  }

  // 4. Another chip: the S3 register must not be written blind, but it still resets.
  {
    const calls = []
    const loader = {
      chip: { CHIP_NAME: 'ESP32-C3' },
      async writeReg(...a) { calls.push(['writeReg', ...a]) },
      async after(...a) { calls.push(['after', ...a]) },
    }
    await resetIntoApp(loader)
    check('non-S3 skips the chip-specific register', !calls.some((c) => c[0] === 'writeReg'))
    check('non-S3 still pulses', calls.some((c) => c[0] === 'after'))
  }

  // 5. A chip that will not answer the register write must still be reset.
  {
    const calls = []
    const loader = {
      chip: { CHIP_NAME: 'ESP32-S3' },
      async writeReg() { throw new Error('no response') },
      async after(...a) { calls.push(a) },
    }
    const outcome = await resetIntoApp(loader)
    check('writeReg failure does not prevent the pulse', calls.length === 1 && outcome === 'pulse')
  }

  // 6. The port vanishing mid-pulse is success, not an exception to the caller.
  {
    const loader = {
      chip: { CHIP_NAME: 'ESP32-S3' },
      async writeReg() {},
      async after() { throw new Error('The device has been lost') },
    }
    let threw = false
    let outcome
    try { outcome = await resetIntoApp(loader) } catch { threw = true }
    check('does not throw when the port disappears', !threw)
    check('reports outcome none', outcome === 'none')
  }

  console.log(bad ? `\n${bad} FAILED` : '\nall reset assertions passed')
  process.exit(bad ? 1 : 0)
})()
