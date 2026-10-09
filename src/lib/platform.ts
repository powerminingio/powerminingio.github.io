/*
 * Who can actually flash, and what to tell everyone else.
 *
 * The gate is deliberately narrower than the Web Serial spec. caniuse says the
 * API also exists in Firefox 151+ and Chrome for Android 154+, but esptool-js
 * documents only Chrome and Edge on the desktop — Firefox fails mid-transfer in
 * practice. So we require a Chromium engine and treat the presence of
 * `navigator.serial` as necessary, not sufficient.
 *
 * Android is served through web-serial-polyfill over WebUSB, which is the path
 * esptool-js documents for it, rather than through Chrome 154's native Web
 * Serial — same reasoning as Firefox: the library is written against the one
 * and not the other.
 */

export type OS = 'windows' | 'macos' | 'linux' | 'chromeos' | 'android' | 'ios' | 'unknown'

/** Why flashing is unavailable, or null when it is available. */
export type Blocker = null | 'insecure' | 'mobile' | 'engine'

/**
 * Which Serial implementation to drive the device with, or null when there is
 * none. 'polyfill' is web-serial-polyfill over WebUSB.
 */
export type SerialSupport = 'native' | 'polyfill' | null

export interface PlatformInfo {
  os: OS
  /** Display name for the OS, interpolated into the copy. Empty when unknown. */
  osLabel: string
  serial: SerialSupport
  blocker: Blocker
}

/** `navigator.userAgentData` is Chromium-only and absent from the DOM lib. */
interface UAData {
  brands?: Array<{ brand: string; version: string }>
  platform?: string
  mobile?: boolean
}

const OS_LABELS: Record<OS, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  chromeos: 'ChromeOS',
  android: 'Android',
  ios: 'iOS',
  unknown: '',
}

function readUAData(): UAData | undefined {
  return (navigator as Navigator & { userAgentData?: UAData }).userAgentData
}

function detectOS(ua: string, uaData?: UAData): OS {
  // Chromium hands us a clean platform name; everything else needs the UA string.
  switch (uaData?.platform) {
    case 'Windows': return 'windows'
    case 'macOS': return 'macos'
    case 'Linux': return 'linux'
    case 'Chrome OS': return 'chromeos'
    case 'Android': return 'android'
  }

  // Order matters: an Android UA also contains "Linux", and a ChromeOS one is
  // matched by "CrOS" before either.
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/CrOS/i.test(ua)) return 'chromeos'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X/i.test(ua)) {
    // iPadOS 13+ ships a desktop Safari UA. Touch points are what give it away.
    return navigator.maxTouchPoints > 1 ? 'ios' : 'macos'
  }
  if (/Linux/i.test(ua)) return 'linux'
  return 'unknown'
}

function isChromium(ua: string, uaData?: UAData): boolean {
  // Positive signal first: every Chromium build lists a "Chromium" brand, and
  // Firefox and Safari do not implement userAgentData at all.
  if (uaData?.brands?.some((b) => b.brand === 'Chromium' || b.brand === 'Google Chrome')) {
    return true
  }

  // No brands, or a build that withholds them — fall back to the UA string
  // rather than rejecting, so a working Chromium browser is never turned away.
  // The iOS browsers below carry Chrome-ish tokens while running WebKit, which
  // has no Web Serial at all, so they are excluded by name.
  if (/CriOS|FxiOS|EdgiOS|OPiOS|SamsungBrowser|Firefox\//i.test(ua)) return false
  return /Chrome\/|Chromium\//i.test(ua)
}

function hasWebSerial(): boolean {
  // @types/w3c-web-serial declares navigator.serial as always present, so a
  // property test would be narrowed away at compile time. `in` survives it.
  return 'serial' in navigator
}

function hasWebUSB(): boolean {
  return 'usb' in navigator
}

function detectSerial(os: OS, chromium: boolean): SerialSupport {
  if (!chromium) return null
  // WebKit powers every browser on iOS and implements neither API.
  if (os === 'ios') return null
  // The polyfill speaks USB CDC-ACM, so it reaches ESP32-S3/C3 native USB but
  // not the CH340 and CP2102 bridges, whose vendor-specific interfaces WebUSB
  // will not enumerate.
  if (os === 'android') return hasWebUSB() ? 'polyfill' : null
  return hasWebSerial() ? 'native' : null
}

export function detectPlatform(): PlatformInfo {
  const uaData = readUAData()
  const ua = navigator.userAgent
  const os = detectOS(ua, uaData)
  const serial = detectSerial(os, isChromium(ua, uaData))

  // First match wins, so the message names the most fundamental problem: an
  // http:// page cannot reach a port no matter which browser is open. A phone
  // that got this far has no usable USB stack, so it is told to find a
  // computer rather than to install something.
  const blocker: Blocker = !window.isSecureContext
    ? 'insecure'
    : serial !== null
      ? null
      : os === 'ios' || os === 'android'
        ? 'mobile'
        : 'engine'

  return { os, osLabel: OS_LABELS[os], serial, blocker }
}
