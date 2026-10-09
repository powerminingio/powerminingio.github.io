/*
 * Exercises connectToMiner() against a stubbed GATT stack.
 *
 * The case that matters most is firmware WITHOUT the scan extension, because
 * that is every device in the field today: getCharacteristic() throws
 * NotFoundError and the feature must report itself unavailable rather than
 * breaking the connection.
 *
 *   node scripts/check-ble-scan-connection.js
 */
const ts = require('typescript')
const fs = require('fs')

const SERVICE = '4fafc201-1fb5-459e-8fcc-c5c9c331914b'
const SCAN_CONTROL = '6a6a30b6-bfdb-48c8-a7ae-97d6d2a66d00'
const SCAN_RESULT = '6a6a30b6-bfdb-48c8-a7ae-97d6d2a66d01'

const enc = new TextEncoder()
const view = (s) => { const b = enc.encode(s); return new DataView(b.buffer, b.byteOffset, b.byteLength) }

class NotFoundError extends Error {
  constructor() { super('characteristic not found'); this.name = 'NotFoundError' }
}

/** @param pages  index -> text the device answers with, or null for "no scan support" */
function makeDevice({ pages, fieldValue = '', scanState = 'DONE,0,-' }) {
  const writes = []
  let cursor = 0
  const char = (uuid) => ({
    uuid,
    value: null,
    async readValue() {
      if (uuid === SCAN_CONTROL) return view(scanState)
      if (uuid === SCAN_RESULT) return view(pages[cursor] ?? '')
      return view(fieldValue)
    },
    async writeValue(bytes) {
      writes.push({ uuid, bytes: Array.from(bytes) })
      if (uuid === SCAN_RESULT) cursor = bytes[0]
    },
    async startNotifications() {},
    addEventListener() {},
  })
  const device = {
    name: 'Bitcube-FC683C',
    addEventListener() {},
    gatt: {
      connected: true,
      async connect() {
        return {
          async getPrimaryService() {
            return {
              async getCharacteristic(uuid) {
                if ((uuid === SCAN_CONTROL || uuid === SCAN_RESULT) && pages === null) {
                  throw new NotFoundError()
                }
                return char(uuid)
              },
            }
          },
        }
      },
      disconnect() {},
    },
  }
  return { device, writes }
}

async function load(stub) {
  const js = ts.transpileModule(fs.readFileSync('src/lib/ble-config.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const nav = { bluetooth: { async requestDevice() { return stub.device } } }
  const mod = { exports: {} }
  new Function('module', 'exports', 'navigator', js)(mod, mod.exports, nav)
  return mod.exports
}

let bad = 0
const check = (name, ok, detail = '') => {
  if (!ok) bad++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}

;(async () => {
  // 1. Firmware without the extension — the path every shipping device takes.
  {
    const stub = makeDevice({ pages: null })
    const { connectToMiner } = await load(stub)
    const miner = await connectToMiner()
    check('connects despite no scan characteristics', miner.name === 'Bitcube-FC683C')
    check('canScan is false', miner.canScan === false)
    await miner.requestScan()
    check('requestScan is a silent no-op', true)
    check('readNetworks returns empty', JSON.stringify(await miner.readNetworks(5)) === '[]')
    let seeded = 'untouched'
    await miner.watchScanState((s) => { seeded = s })
    check('watchScanState does not fire', seeded === 'untouched')
  }

  // 2. Firmware with the extension, paging across two reads.
  {
    const stub = makeDevice({
      pages: { 0: '-40,3,1,Alpha\n-55,0,6,Beta', 2: '-70,4,11,Gamma' },
      scanState: 'DONE,3,2',
    })
    const { connectToMiner } = await load(stub)
    const miner = await connectToMiner()
    check('canScan is true', miner.canScan === true)

    let state = null
    await miner.watchScanState((s) => { state = s })
    check('scan state seeded from a read', state && state.state === 'DONE' && state.count === 3 && state.ageSeconds === 2,
          JSON.stringify(state))

    const nets = await miner.readNetworks(3)
    check('paged across two reads', nets.length === 3, nets.map((n) => n.ssid).join(','))
    check('order preserved', nets.map((n) => n.ssid).join(',') === 'Alpha,Beta,Gamma')
    const idx = stub.writes.filter((w) => w.uuid === SCAN_RESULT).map((w) => w.bytes[0])
    check('index advanced 0 then 2', JSON.stringify(idx) === '[0,2]', JSON.stringify(idx))
  }

  // 3. A hidden network occupies an index but yields no row: the cursor must
  //    advance by lines consumed, or the last network is never reached.
  {
    const stub = makeDevice({
      pages: { 0: '-40,3,1,Alpha\n-80,3,2,', 2: '-70,4,11,Gamma' },
      scanState: 'DONE,3,0',
    })
    const { connectToMiner } = await load(stub)
    const miner = await connectToMiner()
    const nets = await miner.readNetworks(3)
    check('hidden row skipped but index still advances',
          nets.map((n) => n.ssid).join(',') === 'Alpha,Gamma', nets.map((n) => n.ssid).join(','))
  }

  // 4. Firmware that never advances must not hang the UI.
  {
    const stub = makeDevice({ pages: new Proxy({}, { get: () => '-40,3,1,Stuck' }), scanState: 'DONE,99,0' })
    const { connectToMiner } = await load(stub)
    const miner = await connectToMiner()
    const nets = await miner.readNetworks(99)
    check('read loop is bounded', nets.length <= 32, `${nets.length} rows`)
  }

  console.log(bad ? `\n${bad} FAILED` : '\nall connection assertions passed')
  process.exit(bad ? 1 : 0)
})()
