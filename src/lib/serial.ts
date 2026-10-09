import { WebUSBSerialPort } from 'esptool-js'
import { SerialPort as CdcAcmSerialPort } from 'web-serial-polyfill'

import type { SerialSupport } from './platform'

/** WCH, the vendor behind the CH340/CH341 USB-serial bridges. */
const WCH_VENDOR_ID = 0x1a86

/**
 * The CH343 shares WCH's vendor id but presents as CDC-ACM, so it belongs to
 * the polyfill. esptool-js's adapter rejects it outright.
 */
const CH343_PRODUCT_ID = 0x55d3

/** USB class code for a CDC control interface. */
const USB_CDC_CONTROL_CLASS = 2

/**
 * Pick a WebUSB device and wrap it in whichever adapter can talk to it.
 *
 * Android has no Web Serial that esptool-js supports, so the device is driven
 * over WebUSB instead. Two adapters are needed because the boards divide in
 * two: those presenting a standard CDC-ACM interface (ESP32-S3/C3 native USB,
 * and the CH343) and those behind a CH340/CH341, whose vendor-specific
 * interface CDC-ACM cannot address.
 *
 * Both adapters ship a `requestPort()` of their own, but each opens its own
 * picker. Doing the `requestDevice` call here instead means the user sees one
 * list containing every board we can handle, and the adapter is chosen from
 * what they picked rather than guessed at beforehand.
 *
 * Still unreachable on Android: CP2102 and FTDI bridges, which are
 * vendor-specific and have no adapter here. Those need a desktop.
 */
async function requestWebUsbPort() {
  const device = await navigator.usb.requestDevice({
    filters: [{ classCode: USB_CDC_CONTROL_CLASS }, { vendorId: WCH_VENDOR_ID }],
  })

  if (device.vendorId === WCH_VENDOR_ID && device.productId !== CH343_PRODUCT_ID) {
    // esptool-js's CH340 adapter changes baud in place with vendor request
    // 0x9A, so Transport never has to close and reopen the port.
    return new WebUSBSerialPort(device).asSerialPort()
  }

  return new CdcAcmSerialPort(device)
}

/**
 * Open the browser's device picker with whichever Serial implementation this
 * platform needs, and hand back a port esptool-js can drive. The result is
 * interface-compatible in every case, so callers do not need to know which.
 */
export async function requestSerialPort(support: SerialSupport) {
  if (support === 'polyfill') {
    return requestWebUsbPort()
  }
  return navigator.serial.requestPort()
}
