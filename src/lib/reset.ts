import { validateCustomResetStringSequence, type ESPLoader } from 'esptool-js'

/*
 * Rebooting the miner into its application after a flash.
 *
 * esptool-js cannot do this itself. Its HardReset.reset() is:
 *
 *     await sleep(100)
 *     await this.transport.setRTS(false)
 *
 * which only *deasserts* RTS and never asserts it, so EN is never pulled low
 * and no reset pulse exists. Upstream esptool.py pulses the line properly
 * (esp_pylib/serial_reset.py, hard_reset): set_rts(PIN_LOW=True) -> hold ->
 * set_rts(PIN_HIGH=False). Worse, the connect-time UsbJtagSerialReset sequence
 * already ends on setRTS(false), so esptool-js's "hard reset" writes a value
 * the line is holding — a no-op. That is why no web flasher reboots the device.
 *
 * So we issue the pulse ourselves, replicating ESP32S3ROM.hard_reset() through
 * the one public API in esptool-js that can express it.
 */

/** R1 asserts RTS (EN low), W100 holds it, R0 releases (EN high, chip boots). */
const EN_PULSE = 'R1|W100|R0'

/*
 * ESP32-S3 RTC registers, from esptool/targets/esp32s3.py:85-100.
 * RTCCNTL_BASE_REG is 0x60008000; OPTION1 is given there as an absolute value.
 */
const RTC_CNTL_OPTION1_REG = 0x6000812c
const RTC_CNTL_FORCE_DOWNLOAD_BOOT_MASK = 0x1

/** Which path ran, so a field report can say what happened. */
export type ResetOutcome = 'pulse' | 'none'

/*
 * Guard against a future edit reintroducing esptool.py's fractional seconds.
 * `W0.1` fails validation (parseInt("0.1") is 0, rejected as <= 0) and
 * CustomReset.reset() returns *silently* on an invalid sequence rather than
 * throwing — so a wrong delay would be an undetectable no-op. The unit is
 * milliseconds.
 */
if (!validateCustomResetStringSequence(EN_PULSE)) {
  throw new Error(`Reset sequence ${EN_PULSE} is not valid for esptool-js`)
}

/**
 * Reset the chip so it leaves the bootloader and runs the firmware just written.
 *
 * On a device talking over its internal USB peripheral this is the last thing
 * that will succeed: the port re-enumerates as the chip reboots, so everything
 * afterwards has to tolerate it disappearing.
 */
export async function resetIntoApp(loader: ESPLoader): Promise<ResetOutcome> {
  // esptool.py clears this before every ESP32-S3 reset, commented upstream as
  // the workaround for the chip being stuck in download mode afterwards
  // (arduino-esp32#6762). Guarded by chip name because the address is
  // chip-specific — writing it blind on another part would be worse than
  // skipping it. Upstream swallows failures here too; the chip may not answer.
  if (loader.chip?.CHIP_NAME === 'ESP32-S3') {
    try {
      await loader.writeReg(RTC_CNTL_OPTION1_REG, 0, RTC_CNTL_FORCE_DOWNLOAD_BOOT_MASK)
    } catch (error) {
      console.warn('Could not clear force-download-boot; resetting anyway', error)
    }
  }

  try {
    await loader.after('custom_reset', undefined, EN_PULSE)
    return 'pulse'
  } catch (error) {
    // The port can vanish mid-pulse once EN drops, which means it worked.
    console.warn('Reset pulse did not complete cleanly', error)
    return 'none'
  }
}
