'use client'

import { useState, useEffect, useRef } from 'react'
import { ComputerIcon, Download, Usb, Zap } from 'lucide-react'
import { Button } from './ui/button'
import { ESPLoader, Transport } from 'esptool-js'
import { md5 } from 'js-md5'
import { useTranslation } from 'react-i18next'
import Selector from './Selector'
import device_data from './firmware_data.json'
import { Card, Field, Notice, Pill } from './ui/pm'
import { FlashProgress, MacTerm, ProgressRing, type FlashPhase } from './ui/pm-flasher'
import { terminalTheme } from '@/lib/terminal-theme'
import { detectPlatform, type PlatformInfo } from '@/lib/platform'
import { requestSerialPort } from '@/lib/serial'
import { findNvsRegion } from '@/lib/partitions'

import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

// esptool-js documents Chrome and Edge; Brave is the same engine and a common
// choice among miners. Firefox is deliberately absent — see src/lib/platform.ts.
const SUPPORTED_BROWSERS = [
  { name: 'Google Chrome', url: 'https://www.google.com/chrome/' },
  { name: 'Microsoft Edge', url: 'https://www.microsoft.com/edge/download' },
  { name: 'Brave', url: 'https://brave.com/download/' },
]

export default function LandingHero() {
  const { t } = useTranslation();
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [selectedBoardVersion, setSelectedBoardVersion] = useState('')
  const [selectedFirmware, setSelectedFirmware] = useState('')
  const [status, setStatus] = useState('')
  // `status` stays the human sentence; `phase` and `percent` carry the same
  // moment in a form the progress bar can render.
  const [phase, setPhase] = useState<FlashPhase>('idle')
  const [percent, setPercent] = useState<number | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isFlashing, setIsFlashing] = useState(false)
  const [isLogging, setIsLogging] = useState(false)
  const [hasLogs, setHasLogs] = useState(false)
  // null until the effect runs; see the render guard below.
  const [platform, setPlatform] = useState<PlatformInfo | null>(null)
  const serialPortRef = useRef<any>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const terminalContainerRef = useRef<HTMLDivElement>(null)
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null)
  const textDecoderRef = useRef<TextDecoderStream | null>(null)
  const readableStreamClosedRef = useRef<Promise<void> | null>(null)
  const logsRef = useRef<string>('')
  const [keepConfig, setKeepConfig] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  // Deliberately keyed on isLogging alone. `t` changes identity on every
  // language switch, and including it would dispose the terminal mid-session
  // and take the scrollback with it.
  useEffect(() => {
    if (terminalContainerRef.current && !terminalRef.current && isLogging) {
      const term = new Terminal({
        convertEol: true,
        scrollback: 5000,
        fontSize: 12,
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        theme: terminalTheme,
      });
      terminalRef.current = term;
      term.open(terminalContainerRef.current);
      const opening = t('status.loggingStarted');
      term.writeln(opening);
      logsRef.current = opening + '\n';
      setHasLogs(true);
    }

    return () => {
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLogging]);

  type Firmware = { version: string; path: string }
  type Board = { name: string; supported_firmware?: Firmware[] }

  const devices = device_data.devices;
  const device: { name?: string; boards?: Board[]; supported_firmware?: Firmware[] } =
    selectedDevice !== ''
      ? devices.find(d => d.name == selectedDevice)!
      : {};

  // A device lists boards only when it has hardware revisions a buyer must tell
  // apart. A product with one indivisible board carries its firmware directly,
  // and the Board step is skipped rather than shown with an invented name.
  const boards: Board[] = device.boards ?? [];
  const hasBoards = boards.length > 0;

  const board = selectedBoardVersion !== ''
    ? boards.find(b => b.name == selectedBoardVersion)
    : undefined;

  // Every build the flasher offers ships with the site.
  const localFirmwareOptions: Firmware[] =
    (hasBoards ? board?.supported_firmware : device.supported_firmware) ?? [];

  // Every device ships exactly one pinned build today, so preselect it rather
  // than making the version a third click that only ever has one answer.
  useEffect(() => {
    setSelectedFirmware(localFirmwareOptions[0]?.version ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDevice, selectedBoardVersion]);

  const handleConnect = async () => {
    setIsConnecting(true)
    setPhase('connecting')
    setPercent(null)
    setStatus(t('status.connecting'))

    try {
      // Native Web Serial on the desktop, web-serial-polyfill over WebUSB on
      // Android. The port is interface-compatible either way, so nothing below
      // this line needs to know which one it got.
      const port = await requestSerialPort(platform?.serial ?? 'native')
      await port.open({
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      })

      serialPortRef.current = port
      setIsConnected(true)
      setPhase('connected')
      setStatus(t('status.connected'))
    } catch (error) {
      console.error('Connection failed:', error)
      setPhase('error')
      setStatus(`${t('status.connectionFailed')}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (isLogging) {
      await stopSerialLogging();
    }
    try {
      if (serialPortRef.current?.readable) {
        await serialPortRef.current.close();
      }
      serialPortRef.current = null;
      setIsConnected(false)
      setPhase('idle')
      setPercent(null)
      setStatus("")
    } catch (error) {
      console.error('Disconnect error:', error);
      setPhase('error')
      setStatus(`${t('status.disconnectError')}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const handleKeepConfigToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    setKeepConfig(event.target.checked);
  };

  const startSerialLogging = async () => {
    if (!serialPortRef.current) {
      setStatus(t('status.connectFirst'));
      return;
    }

    try {
      setIsLogging(true);
      const port = serialPortRef.current;

      // First ensure any existing connections are cleaned up
      if (readerRef.current) {
        await readerRef.current.cancel();
      }
      if (readableStreamClosedRef.current) {
        await readableStreamClosedRef.current;
      }

      // Set up text decoder stream
      const decoder = new TextDecoderStream();
      const inputDone = port.readable.pipeTo(decoder.writable);
      const inputStream = decoder.readable;
      const reader = inputStream.getReader();

      textDecoderRef.current = decoder;
      readableStreamClosedRef.current = inputDone;
      readerRef.current = reader;

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            reader.releaseLock();
            break;
          }
          terminalRef.current?.write(value);
          logsRef.current += value;
        }
      } catch (error) {
        console.error('Error in read loop:', error);
      }
    } catch (error) {
      console.error('Serial logging error:', error);
      setPhase('error')
      setStatus(`${t('status.loggingError')}: ${error instanceof Error ? error.message : String(error)}`);
    }
    setIsLogging(false);
  };

  const stopSerialLogging = async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (readableStreamClosedRef.current) {
        await readableStreamClosedRef.current;
        readableStreamClosedRef.current = null;
      }
      if (textDecoderRef.current) {
        textDecoderRef.current = null;
      }
    } catch (error) {
      console.error('Error stopping serial logging:', error);
    } finally {
      setIsLogging(false);
    }
  };

  const downloadLogs = () => {
    const blob = new Blob([logsRef.current], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `miner-logs-${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleStartFlashing = async () => {
    if (!serialPortRef.current) {
      setStatus(t('status.connectFirst'))
      return
    }

    if (!selectedDevice || (hasBoards && !selectedBoardVersion)) {
      setStatus(t('status.selectBoth'))
      return
    }
    
    if (!selectedFirmware) {
      setStatus(t('status.selectBoth'))
      return
    }

    setIsFlashing(true)
    setPhase('preparing')
    setPercent(null)
    setStatus(t('status.preparing'))

    try {
      // Stop logging if it's active
      if (isLogging) {
        await stopSerialLogging();
      }

      // Close the current connection
      if (serialPortRef.current.readable) {
        await serialPortRef.current.close();
      }

      // Create transport and ESPLoader for flashing
      const transport = new Transport(serialPortRef.current);
      const loader = new ESPLoader({
        transport,
        baudrate: 115200,
        romBaudrate: 115200,
        terminal: {
          clean() { },
          writeLine(data: string) {
            // setStatus(data);
          },
          write(data: string) {
            // setStatus(data);
          },
        },
      });

      await loader.main();

      const localFirmware = localFirmwareOptions.find(f => f.version === selectedFirmware);
      if (!localFirmware) {
        throw new Error('No firmware available for the selected device and board version');
      }

      setPhase('downloading');
      setStatus(t('status.downloadFirmware'));

      // Same-origin: the binary ships with the site, so there is no CORS hop and
      // no third-party host in the path. Integrity comes from the deploy itself.
      const firmwareResponse = await fetch(localFirmware.path);
      if (!firmwareResponse.ok) {
        throw new Error(`Failed to load firmware file (status ${firmwareResponse.status})`);
      }
      const firmwareArrayBuffer = await firmwareResponse.arrayBuffer();

      const firmwareUint8Array = new Uint8Array(firmwareArrayBuffer)

      setPhase('flashing')
      setPercent(0)
      setStatus(t('status.flashing', { percent: 0 }))

      // Where NVS sits differs per board, so read it from the partition table
      // this very image carries rather than assuming a fixed offset and size.
      const nvs = keepConfig ? findNvsRegion(firmwareUint8Array) : null;

      if (keepConfig && nvs === null) {
        // Writing the whole image here would erase the settings the user just
        // asked to keep, so stop instead and say why.
        throw new Error(t('status.nvsNotFound'));
      }

      let parts;

      if (nvs) {
        const nvsEnd = nvs.offset + nvs.size;
        parts = [
          {
            data: firmwareUint8Array.subarray(0, nvs.offset), // Data before NVS
            address: 0,
          },
          {
            data: firmwareUint8Array.subarray(nvsEnd), // Data after NVS
            address: nvsEnd,
          },
        ];
      } else {
        parts = [
          {
            data: firmwareUint8Array, // Entire firmware binary
            address: 0,
          },
        ];
      }

      await loader.writeFlash({
        fileArray: parts,
        flashSize: "keep",
        flashMode: "keep",
        flashFreq: "keep",
        eraseAll: false,
        compress: true,
        reportProgress: (fileIndex, written, total) => {
          const percent = Math.round((written / total) * 100)
          setPercent(percent)
          if (percent == 100) {
            setStatus(t('status.completed'))
          } else {
            setStatus(t('status.flashing', { percent: percent }))
          }
        },
        // A real hash, so esptool-js compares it against the device's own
        // flash MD5 and throws on a bad write instead of silently skipping.
        calculateMD5Hash: (image) => md5(image),
      })

      setPercent(100)
      setStatus(t('status.completed'))
      
      // Hard reset the device
      await loader.after('hard_reset')
      
      // Disconnect the transport to release the serial port
      await transport.disconnect()
      
      // Close the serial port to complete the disconnection
      if (serialPortRef.current?.readable) {
        await serialPortRef.current.close()
      }
      
      // Clear the serial port reference and update connection state
      serialPortRef.current = null
      setIsConnected(false)

      setPhase('done')
      setStatus(t('status.success'))
    } catch (error) {
      console.error('Flashing failed:', error)
      setPhase('error')
      setPercent(null)
      setStatus(`${t('status.flashingFailed')}: ${error instanceof Error ? error.message : String(error)}. ${t('status.tryAgain')}`)
    } finally {
      setIsFlashing(false)
    }
  }

  const heroHeading = (
    <div className="space-y-3">
      <h1 className="text-[clamp(32px,4vw,48px)] font-bold leading-[1.08] tracking-[-0.022em]">
        {t('hero.title')}
      </h1>
      <p className="mx-auto max-w-[52ch] text-[clamp(15px,1.4vw,18px)] leading-relaxed text-muted-foreground">
        {t('hero.description')}
      </p>
    </div>
  )

  const shell = (children: React.ReactNode) => (
    <section className="relative z-10 mx-auto w-full max-w-[1100px] px-4 py-12 text-center sm:px-8 md:py-20">
      <div className="flex flex-col items-center gap-6">
        {heroHeading}
        {children}
      </div>
    </section>
  )

  // The check runs in an effect, so the first paint does not know the answer
  // yet. Show the heading alone rather than a flasher we may be about to
  // replace with "this browser can't do that".
  if (platform === null) {
    return shell(null)
  }

  if (platform.blocker !== null) {
    const osLabel = platform.osLabel || t('errors.browserCompatibility.thisSystem')
    const message =
      platform.blocker === 'insecure'
        ? t('errors.browserCompatibility.insecure')
        : platform.blocker === 'mobile'
          ? t('errors.browserCompatibility.mobile')
          : t('errors.browserCompatibility.description', { os: osLabel })

    // Only the engine case has something to download: there is no supported
    // browser to install on iOS, and an insecure page is fixed by its URL.
    const downloads =
      platform.blocker === 'engine' ? (
        <>
          <span>{t('errors.browserCompatibility.getBrowser')}</span>
          {SUPPORTED_BROWSERS.map((browser) => (
            <a
              key={browser.name}
              className="text-primary underline-offset-[3px] hover:underline"
              href={browser.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {browser.name}
            </a>
          ))}
        </>
      ) : undefined

    return shell(
      <Notice
        tone="warning"
        role="alert"
        title={t('errors.browserCompatibility.title')}
        className="max-w-[560px]"
        actions={downloads}
      >
        <p className="mt-1">{message}</p>
      </Notice>,
    )
  }

  return (
    <section className="relative z-10 mx-auto w-full max-w-[1100px] px-4 py-12 sm:px-8 md:py-20">
      <div className="flex flex-col items-center gap-8 text-center">
        {heroHeading}

        <Card glass className="w-full max-w-[420px] space-y-3">
          <Button
            className="w-full"
            onClick={isConnected ? handleDisconnect : handleConnect}
            disabled={isConnecting || isFlashing}
          >
            {isConnected ? t('hero.disconnect') : t('hero.connect')}
            <Usb />
          </Button>

          <Field label={t('hero.deviceLabel')} htmlFor="device">
            <Selector
              id="device"
              placeholder={t('hero.selectDevice')}
              values={devices.map(d => d.name)}
              onValueChange={(value) => {
                setSelectedDevice(value)
                setSelectedBoardVersion('')
                setSelectedFirmware('')
              }}
              disabled={isConnecting || isFlashing || !isConnected}
            />
          </Field>

          {selectedDevice && hasBoards && (
            <Field label={t('hero.boardLabel')} htmlFor="board">
              <Selector
                id="board"
                placeholder={t('hero.selectBoard')}
                value={selectedBoardVersion}
                values={boards.map(b => b.name)}
                onValueChange={(value) => {
                  setSelectedBoardVersion(value)
                  setSelectedFirmware('')
                }}
                disabled={isConnecting || isFlashing}
              />
            </Field>
          )}

          {selectedDevice && (!hasBoards || selectedBoardVersion) && (
            <Field label={t('hero.firmwareLabel')} htmlFor="firmware">
              <Selector
                id="firmware"
                placeholder={t('hero.selectFirmware')}
                value={selectedFirmware}
                values={localFirmwareOptions.map(f => f.version)}
                onValueChange={setSelectedFirmware}
                disabled={isConnecting || isFlashing}
              />
            </Field>
          )}

          <div className="flex items-center gap-2 text-left">
            <input
              type="checkbox"
              id="keepConfig"
              className="pm-check"
              checked={keepConfig}
              onChange={handleKeepConfigToggle}
            />
            <label htmlFor="keepConfig" className="cursor-pointer text-sm text-muted-foreground">
              {t('hero.keepConfig')}
            </label>
          </div>

          <Button
            className="w-full"
            onClick={handleStartFlashing}
            disabled={!selectedDevice || (hasBoards && !selectedBoardVersion) || !selectedFirmware || isConnecting || isFlashing || !isConnected}
          >
            {isFlashing ? t('hero.flashing') : t('hero.startFlashing')}
            {isFlashing ? <ProgressRing percent={percent} title={status} /> : <Zap />}
          </Button>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant="outline"
              onClick={isLogging ? stopSerialLogging : startSerialLogging}
              disabled={!isConnected || isFlashing}
            >
              {isLogging ? t('hero.stopLogging') : t('hero.startLogging')}
              <ComputerIcon />
            </Button>
            <Button
              className="flex-1"
              variant="outline"
              onClick={downloadLogs}
              disabled={!hasLogs}
            >
              {t('hero.downloadLogs')}
              <Download />
            </Button>
          </div>

          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t('hero.loggingDescription')}
          </p>

          {phase !== 'idle' && (
            <FlashProgress
              phase={phase}
              percent={percent}
              status={status}
              label={t(`status.phase.${phase}`)}
            />
          )}
        </Card>

        {isLogging && (
          <MacTerm
            ref={terminalContainerRef}
            title={t('hero.startLogging')}
            aside={<Pill tone="success">{t('status.phase.connected')}</Pill>}
            className="w-full max-w-4xl"
          />
        )}
      </div>
    </section>
  )
}
