'use client'

import { useState, useEffect, useRef } from 'react'
import { ComputerIcon, Download, Usb, Zap } from 'lucide-react'
import { Button } from './ui/button'
import { ESPLoader, Transport } from 'esptool-js'
import { useTranslation } from 'react-i18next'
import Selector from './Selector'
import device_data from './firmware_data.json'
import { Card, Field, Notice, Pill } from './ui/pm'
import { FlashProgress, MacTerm, ProgressRing, type FlashPhase } from './ui/pm-flasher'
import { terminalTheme } from '@/lib/terminal-theme'

import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

interface FirmwareRelease {
  version: string;
  name: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
}

const R2_BASE_URL = 'https://fw.wantclue.de';

const parseGitHubRepo = (repositoryUrl: string) => {
  const repoMatch = repositoryUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!repoMatch) throw new Error('Invalid repository URL');
  const [, owner, repo] = repoMatch;
  return { owner, repo };
};

const fetchGitHubAPI = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
  return response.json();
};

const extractSHA256Hash = (releaseBody: string, binaryName: string) => {
  const lines = (releaseBody || '').split('\n');
  for (const line of lines) {
    if (line.includes(binaryName)) {
      const parts = line.split(/\s+/);
      if (parts.length > 1 && parts[1] === binaryName) {
        return parts[0]; // Return the first part as the hash
      }
    }
  }
  return null;
};

// Calculate SHA256 hash of downloaded binary
const calculateSHA256 = async (data: ArrayBuffer) => {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

// Fetch the SHA256 hash for a specific binary from GitHub release notes
const fetchSHA256Hash = async (repositoryUrl: string, versionTag: string, binaryName: string) => {
  try {
    const { owner, repo } = parseGitHubRepo(repositoryUrl);
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${versionTag}`;
    const release = await fetchGitHubAPI(apiUrl);
    return extractSHA256Hash(release.body, binaryName);
  } catch (error) {
    console.error('Error fetching SHA256 hash:', error);
    return null;
  }
};

export default function LandingHero() {
  const { t } = useTranslation();
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [selectedBoardVersion, setSelectedBoardVersion] = useState('')
  const [selectedFirmware, setSelectedFirmware] = useState('')
  const [firmwareOptions, setFirmwareOptions] = useState<FirmwareRelease[]>([]);
  const [isLoadingFirmware, setIsLoadingFirmware] = useState(false);
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
  const [isChromiumBased, setIsChromiumBased] = useState(true)
  const serialPortRef = useRef<any>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const terminalContainerRef = useRef<HTMLDivElement>(null)
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null)
  const textDecoderRef = useRef<TextDecoderStream | null>(null)
  const readableStreamClosedRef = useRef<Promise<void> | null>(null)
  const logsRef = useRef<string>('')
  const [keepConfig, setKeepConfig] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isChromium = /chrome|chromium|crios|edge/i.test(userAgent);
    setIsChromiumBased(isChromium);
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

  const devices = device_data.devices;
  const device = selectedDevice !== ''
    ? devices.find(d => d.name == selectedDevice)!
    : { boards: [], repository: '' };
  const board = selectedBoardVersion !== ''
    ? device.boards.find(b => b.name == selectedBoardVersion)!
    : { supported_firmware: [] as Array<{ version: string; path: string }>, name: '' };
  
  // Get local firmware options (only for devices without GitHub repository)
  const localFirmwareOptions = board && 'supported_firmware' in board ? board.supported_firmware || [] : [];

  // Fetch releases from GitHub when device and board are selected
  const fetchReleases = async (repositoryUrl: string, boardName: string): Promise<FirmwareRelease[]> => {
    try {
      if (!repositoryUrl) {
        // Fall back to local firmware files if no repository URL
        return [];
      }

      const repoMatch = repositoryUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!repoMatch) throw new Error('Invalid repository URL');

      const [, owner, repo] = repoMatch;
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases`;

      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);

      const releases = await response.json();
      const filteredReleases = releases.filter((release: any) => !release.prerelease && !release.draft);

      return filteredReleases.map((release: any) => ({
        version: release.tag_name,
        name: release.name,
        assets: release.assets.filter((asset: any) =>
          asset.name.startsWith(`esp-miner-factory-${boardName}-${release.tag_name}`)
        ),
      })).filter((release: any) => release.assets.length > 0);
    } catch (error) {
      console.error('Error fetching releases:', error);
      return [];
    }
  };

  // Effect to fetch firmware options when device and board change
  useEffect(() => {
    const updateFirmwareOptions = async () => {
      if (!selectedDevice || !selectedBoardVersion) {
        setFirmwareOptions([]);
        return;
      }

      const deviceData = device_data.devices.find((d) => d.name === selectedDevice);
      if (deviceData && deviceData.repository) {
        setIsLoadingFirmware(true);
        const firmwareData = await fetchReleases(deviceData.repository, selectedBoardVersion);
        setFirmwareOptions(firmwareData);
        setIsLoadingFirmware(false);
      } else {
        // Fall back to local firmware data if no repository
        setFirmwareOptions([]);
      }
    };

    updateFirmwareOptions();
  }, [selectedDevice, selectedBoardVersion]);

  const handleConnect = async () => {
    setIsConnecting(true)
    setPhase('connecting')
    setPercent(null)
    setStatus(t('status.connecting'))

    try {
      const port = await navigator.serial.requestPort()
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
    a.download = `bitaxe-logs-${timestamp}.txt`;
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

    if (!selectedDevice || !selectedBoardVersion) {
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

      let firmwareArrayBuffer: ArrayBuffer;

      // Check if we have GitHub firmware options available
      const firmwareData = firmwareOptions.find(f => f.version === selectedFirmware);
      
      if (firmwareData && firmwareData.assets.length > 0) {
        const firmwareUrl = firmwareData.assets[0].browser_download_url;
        const binaryName = decodeURIComponent(firmwareUrl.split('/').pop()!); // e.g. esp-miner-factory-402-v2.5.0.bin
        const r2Url = `${R2_BASE_URL}/${selectedFirmware}/${binaryName}`;

        console.log(`Downloading firmware from R2: ${r2Url}`);

        // Fetch SHA256 from GitHub release body for verification
        const sha256Hash = await fetchSHA256Hash(device.repository, selectedFirmware, binaryName);

        if (sha256Hash) {
          console.log(`Found SHA256 hash: ${sha256Hash}`);
        } else {
          console.warn('No SHA256 hash found');
        }

        setPhase('downloading');
        setStatus(t('status.downloadFirmware'));

        const firmwareResponse = await fetch(r2Url);
        if (!firmwareResponse.ok) {
          throw new Error(`Failed to download firmware from R2 (status ${firmwareResponse.status})`);
        }

        firmwareArrayBuffer = await firmwareResponse.arrayBuffer();

        // Compare the calculated hash with the fetched hash
        if (sha256Hash) {
          // Calculate the SHA256 hash of the downloaded binary
          const calculatedHash = await calculateSHA256(firmwareArrayBuffer);
          console.log(`Calculated SHA256 hash of downloaded binary: ${calculatedHash}`);

          if (calculatedHash === sha256Hash) {
            console.log('SHA256 hash verification successful. Binary is valid.');
          } else {
            console.error('SHA256 hash verification failed! Binary may be corrupted or tampered with.');
            throw new Error('Hash verification failed');
          }
        } else {
          // TODO: versions don't have hashes on the release page
          // in this case we warn silently in the console but accept the risk
          console.warn("No SHA256 found on the release page!");
        }
      } else {
        // Fall back to local firmware files
        const localFirmware = localFirmwareOptions.find(f => f.version === selectedFirmware);
        if (!localFirmware) {
          throw new Error('No firmware available for the selected device and board version');
        }
        const firmwareResponse = await fetch(localFirmware.path);
        if (!firmwareResponse.ok) {
          throw new Error('Failed to load firmware file');
        }
        firmwareArrayBuffer = await firmwareResponse.arrayBuffer();
      }

      const firmwareUint8Array = new Uint8Array(firmwareArrayBuffer)
      const firmwareBinaryString = Array.from(firmwareUint8Array, (byte) => String.fromCharCode(byte)).join('')

      setPhase('flashing')
      setPercent(0)
      setStatus(t('status.flashing', { percent: 0 }))

      // On all Bitaxe derivatives the same
      const nvsStart = 0x9000;
      const nvsSize = 0x6000;

      let parts;

      if (keepConfig) {
        parts = [
          {
            data: firmwareBinaryString.slice(0, nvsStart), // Data before NVS
            address: 0,
          },
          {
            data: firmwareBinaryString.slice(nvsStart + nvsSize), // Data after NVS
            address: nvsStart + nvsSize,
          },
        ];
      } else {
        parts = [
          {
            data: firmwareBinaryString, // Entire firmware binary
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
        calculateMD5Hash: () => '',
      })

      setPercent(100)
      setStatus(t('status.completed'))
      
      // Hard reset the device
      await loader.hardReset()
      
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

  if (!isChromiumBased) {
    return (
      <section className="relative z-10 mx-auto w-full max-w-[1100px] px-4 py-12 text-center sm:px-8 md:py-20">
        <div className="flex flex-col items-center gap-6">
          {heroHeading}
          <Notice
            tone="warning"
            role="alert"
            title={t('errors.browserCompatibility.title')}
            className="max-w-[560px]"
          >
            <p className="mt-1">{t('errors.browserCompatibility.description')}</p>
          </Notice>
        </div>
      </section>
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

          {selectedDevice && (
            <Field label={t('hero.boardLabel')} htmlFor="board">
              <Selector
                id="board"
                placeholder={t('hero.selectBoard')}
                value={selectedBoardVersion}
                values={device.boards.map(b => b.name)}
                onValueChange={(value) => {
                  setSelectedBoardVersion(value)
                  setSelectedFirmware('')
                }}
                disabled={isConnecting || isFlashing}
              />
            </Field>
          )}

          {selectedBoardVersion && (
            <Field label={t('hero.firmwareLabel')} htmlFor="firmware">
              <Selector
                id="firmware"
                placeholder={isLoadingFirmware ? t('hero.loadingFirmware') : t('hero.selectFirmware')}
                value={selectedFirmware}
                values={
                  firmwareOptions.length > 0
                    ? firmwareOptions.map(f => f.version)
                    : localFirmwareOptions.map(f => f.version)
                }
                onValueChange={setSelectedFirmware}
                disabled={isConnecting || isFlashing || isLoadingFirmware}
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
            disabled={!selectedDevice || !selectedBoardVersion || !selectedFirmware || isConnecting || isFlashing || !isConnected}
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
