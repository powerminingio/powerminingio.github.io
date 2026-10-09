/*
 * Client for the miner's BLE setup service.
 *
 * The firmware side is pm-miner's components/bluetooth, which replicates
 * ESP-Miner's service (upstream PR #1827) byte for byte — so this drives Bitaxe
 * hardware as well. Nothing here needs a library: Web Bluetooth is a browser
 * API, and the service requires no pairing, so a plain GATT connect is enough.
 *
 * The service is only live while the miner is in setup mode. It starts a few
 * seconds after the provisioning SoftAP and is torn down the moment Wi-Fi
 * connects, once per boot — so a miner already on the network will not appear
 * in the chooser. That is the firmware's documented behaviour, not a fault.
 *
 * Values are staged on write and only persisted when APPLY is sent, and only
 * the fields actually written are touched.
 */

export const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b'

/** Characteristic UUIDs. The last byte is the field ordinal. */
const CHAR_BASE = 'beb5483e-36e1-4688-b7f5-ea07361b26'

export const FIELDS = {
  wifiSsid: { uuid: `${CHAR_BASE}a8`, maxBytes: 32 },
  wifiPassword: { uuid: `${CHAR_BASE}a9`, maxBytes: 64 },
  poolUrl: { uuid: `${CHAR_BASE}aa`, maxBytes: 80 },
  poolPort: { uuid: `${CHAR_BASE}ab`, maxBytes: 5 },
  poolUser: { uuid: `${CHAR_BASE}ac`, maxBytes: 80 },
  poolPassword: { uuid: `${CHAR_BASE}ad`, maxBytes: 64 },
} as const

export type FieldName = keyof typeof FIELDS

/** Order the form renders them in, and the order they are written in. */
export const FIELD_ORDER: FieldName[] = [
  'wifiSsid',
  'wifiPassword',
  'poolUrl',
  'poolPort',
  'poolUser',
  'poolPassword',
]

const STATUS_UUID = `${CHAR_BASE}ae`
const COMMAND_UUID = `${CHAR_BASE}af`

export type Command = 'APPLY' | 'RESTART' | 'STATUS'

/** Status values the firmware defines. Anything else is shown verbatim. */
export const KNOWN_STATUSES = [
  'READY',
  'PENDING_APPLY',
  'APPLIED_RESTART_REQUIRED',
  'RESTARTING',
  'ERROR_INVALID_SSID',
  'ERROR_INVALID_WIFI_PASSWORD',
  'ERROR_INVALID_POOL_URL',
  'ERROR_INVALID_POOL_PORT',
  'ERROR_INVALID_POOL_USER',
  'ERROR_INVALID_POOL_PASSWORD',
  'ERROR_UNKNOWN_COMMAND',
  'ERROR_PERSIST_FAILED',
] as const

export type FieldValues = Record<FieldName, string>

export interface MinerConnection {
  /** Advertised local name, e.g. "Bitcube-FC683C". */
  name: string
  readAll(): Promise<FieldValues>
  write(field: FieldName, value: string): Promise<void>
  sendCommand(command: Command): Promise<void>
  /** Subscribe to status; returns the current value immediately too. */
  watchStatus(onStatus: (status: string) => void): Promise<void>
  onDisconnected(handler: () => void): void
  disconnect(): void
}

/** Raised when a value is longer than the characteristic accepts. */
export class FieldTooLongError extends Error {
  constructor(
    readonly field: FieldName,
    readonly maxBytes: number,
  ) {
    super(`${field} exceeds ${maxBytes} bytes`)
    this.name = 'FieldTooLongError'
  }
}

export function isBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

/**
 * Whether a radio is actually present, which is a different question from
 * whether the browser implements the API.
 */
export async function hasBluetoothRadio(): Promise<boolean> {
  if (!isBluetoothAvailable()) return false
  try {
    return await navigator.bluetooth.getAvailability()
  } catch {
    return false
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Trailing NULs are not transferred, but be tolerant of firmware that pads. */
function decode(view: DataView): string {
  return decoder.decode(view).replace(/\0+$/, '')
}

/**
 * Open the chooser and connect. Filtering on the service UUID — which the
 * firmware puts in the scan response — both narrows the list to miners and
 * grants GATT access, so no separate optionalServices entry is needed.
 */
export async function connectToMiner(): Promise<MinerConnection> {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }],
  })

  const server = await device.gatt!.connect()
  const service = await server.getPrimaryService(SERVICE_UUID)

  // Resolve every characteristic once; the handles stay valid for the session.
  const entries = await Promise.all(
    FIELD_ORDER.map(
      async (name) => [name, await service.getCharacteristic(FIELDS[name].uuid)] as const,
    ),
  )
  const chars = Object.fromEntries(entries) as Record<FieldName, BluetoothRemoteGATTCharacteristic>
  const status = await service.getCharacteristic(STATUS_UUID)
  const command = await service.getCharacteristic(COMMAND_UUID)

  return {
    name: device.name ?? '',

    async readAll() {
      const values = await Promise.all(
        FIELD_ORDER.map(async (name) => [name, decode(await chars[name].readValue())] as const),
      )
      return Object.fromEntries(values) as FieldValues
    },

    async write(field, value) {
      const bytes = encoder.encode(value)
      if (bytes.length > FIELDS[field].maxBytes) {
        // Check here rather than letting the device answer with a bare ATT
        // error, which carries no field name.
        throw new FieldTooLongError(field, FIELDS[field].maxBytes)
      }
      await chars[field].writeValue(bytes)
    },

    async sendCommand(cmd) {
      await command.writeValue(encoder.encode(cmd))
    },

    async watchStatus(onStatus) {
      status.addEventListener('characteristicvaluechanged', (event) => {
        const value = (event.target as BluetoothRemoteGATTCharacteristic).value
        if (value) onStatus(decode(value))
      })
      await status.startNotifications()
      // Nothing is pushed until the value next changes, so seed it.
      onStatus(decode(await status.readValue()))
    },

    onDisconnected(handler) {
      // RESTART always drops the link, so this is a normal end to a session
      // rather than only an error path.
      device.addEventListener('gattserverdisconnected', handler)
    },

    disconnect() {
      if (device.gatt?.connected) device.gatt.disconnect()
    },
  }
}
