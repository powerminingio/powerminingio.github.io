'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bluetooth, Eye, EyeOff, RadioTower, RotateCw, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from './ui/button'
import { Card, CardTitle, Field, Notice, Pill, type PillTone } from './ui/pm'
import { ProgressReadout } from './ui/pm-flasher'
import {
  FIELDS,
  FIELD_ORDER,
  FieldTooLongError,
  classifyStatus,
  connectToMiner,
  hasBluetoothRadio,
  type BlePhase,
  type FieldName,
  type FieldValues,
  type MinerConnection,
  type ScanStatus,
  type ScannedNetwork,
} from '@/lib/ble-config'
import type { OS } from '@/lib/platform'

const EMPTY: FieldValues = {
  wifiSsid: '',
  wifiPassword: '',
  poolUrl: '',
  poolPort: '',
  poolUser: '',
  poolPassword: '',
}

const SECRET: ReadonlySet<FieldName> = new Set<FieldName>(['wifiPassword', 'poolPassword'])

/** Characteristic limits are bytes; the maxLength attribute counts characters. */
const inputClass =
  'flex min-h-[46px] w-full items-center rounded-xl border border-input bg-background/80 px-3 py-2 text-left text-sm text-foreground placeholder:text-muted-foreground/70 focus:shadow-focus focus:outline-none disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-50'

const phaseTone: Record<BlePhase, PillTone> = {
  idle: 'neutral',
  connecting: 'info',
  reading: 'info',
  ready: 'info',
  saving: 'info',
  applied: 'success',
  restarting: 'info',
  error: 'danger',
}

/** Phases that are actively doing something, so the bar should show. */
const RUNNING: ReadonlySet<BlePhase> = new Set<BlePhase>(['connecting', 'reading', 'saving', 'restarting'])

export default function BleConfigurator({
  step,
  available,
  os,
}: {
  /** Step number shown on the card heading, paired with the flasher card. */
  step?: number
  available: boolean
  os: OS
}) {
  const { t } = useTranslation()

  const connectionRef = useRef<MinerConnection | null>(null)
  const [deviceName, setDeviceName] = useState('')
  const [values, setValues] = useState<FieldValues>(EMPTY)
  // What the miner reported on connect, so Save writes only what changed.
  const [saved, setSaved] = useState<FieldValues>(EMPTY)
  const [status, setStatus] = useState('')
  const [phase, setPhase] = useState<BlePhase>('idle')
  // null while a phase is running with nothing countable to report.
  const [percent, setPercent] = useState<number | null>(null)
  /** Client-side sentence for the stretches where the firmware says nothing. */
  const [activity, setActivity] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revealed, setRevealed] = useState<FieldName[]>([])
  const [hasRadio, setHasRadio] = useState(true)
  // Wi-Fi scan, present only on firmware carrying the extension.
  const [canScan, setCanScan] = useState(false)
  const [scan, setScan] = useState<ScanStatus | null>(null)
  const [networks, setNetworks] = useState<ScannedNetwork[]>([])

  const isConnected = deviceName !== ''

  useEffect(() => {
    if (!available) return
    // A browser can implement the API and still have no adapter; those are
    // different problems and deserve different messages.
    hasBluetoothRadio().then(setHasRadio)
  }, [available])

  const reset = useCallback(() => {
    connectionRef.current = null
    setDeviceName('')
    setValues(EMPTY)
    setSaved(EMPTY)
    setStatus('')
    setPhase('idle')
    setPercent(null)
    setActivity('')
    setRevealed([])
    setCanScan(false)
    setScan(null)
    setNetworks([])
  }, [])

  // Drop the link if the card goes away mid-session.
  useEffect(() => () => connectionRef.current?.disconnect(), [])

  const handleConnect = async () => {
    setError('')
    setBusy(true)
    setPhase('connecting')
    setPercent(null)
    setActivity(t('ble.choosingDevice'))
    try {
      const miner = await connectToMiner()
      connectionRef.current = miner
      // A RESTART always drops the link, so treat this as a normal ending.
      miner.onDisconnected(reset)
      // The firmware's status drives the phase from here on, except while we
      // are mid-read or mid-save, which the handlers own.
      await miner.watchStatus((next) => {
        setStatus(next)
        setPhase((current) =>
          current === 'reading' || current === 'saving' ? current : classifyStatus(next),
        )
      })

      setCanScan(miner.canScan)
      if (miner.canScan) {
        // Seeded with a read, so a cache warmed when the hotspot opened shows
        // up immediately rather than after the first manual scan.
        await miner.watchScanState((state) => {
          setScan(state)
          if (state.count > 0 && (state.state === 'DONE' || state.state === 'THROTTLED')) {
            miner.readNetworks(state.count).then(setNetworks).catch(() => setNetworks([]))
          }
        })
      }

      setPhase('reading')
      setPercent(0)
      setActivity(t('ble.readingSettings'))
      const current = await miner.readAll((done, total) =>
        setPercent(Math.round((done / total) * 100)),
      )
      setValues(current)
      setSaved(current)
      setDeviceName(miner.name)

      setPhase(classifyStatus(status))
      setPercent(null)
      setActivity('')
    } catch (e) {
      // Dismissing the chooser rejects with NotFoundError; that is not an error.
      if (!(e instanceof DOMException && e.name === 'NotFoundError')) {
        setError(`${t('ble.connectFailed')}: ${e instanceof Error ? e.message : String(e)}`)
        setPhase('error')
      } else {
        setPhase('idle')
      }
      setPercent(null)
      setActivity('')
      connectionRef.current = null
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = () => {
    connectionRef.current?.disconnect()
    reset()
  }

  const handleSave = async () => {
    const miner = connectionRef.current
    if (!miner) return
    setError('')
    setBusy(true)

    // Only touched fields are written, so anything left alone keeps its
    // current value on the miner. APPLY is the last step, which is why the
    // denominator is changed + 1: the bar hits 100% when the miner has
    // accepted the batch, not when the final write returns.
    const changed = FIELD_ORDER.filter((field) => values[field] !== saved[field])
    const steps = changed.length + 1
    let step = 0

    setPhase('saving')
    setPercent(0)
    try {
      for (const field of changed) {
        setActivity(t('ble.writingField', { name: t(`ble.${field}`) }))
        await miner.write(field, values[field])
        step += 1
        setPercent(Math.round((step / steps) * 100))
      }

      setActivity(t('ble.applying'))
      await miner.sendCommand('APPLY')
      setPercent(100)
      setActivity('')
      setSaved(values)
      // The firmware's APPLIED_RESTART_REQUIRED notification moves the phase on.
    } catch (e) {
      if (e instanceof FieldTooLongError) {
        setError(t('ble.tooLong', { field: t(`ble.${e.field}`), max: e.maxBytes }))
      } else {
        setError(`${t('ble.saveFailed')}: ${e instanceof Error ? e.message : String(e)}`)
      }
      setPhase('error')
      setPercent(null)
      setActivity('')
    } finally {
      setBusy(false)
    }
  }

  const handleRestart = async () => {
    setError('')
    setBusy(true)
    setPhase('restarting')
    setPercent(null)
    setActivity('')
    try {
      await connectionRef.current?.sendCommand('RESTART')
    } catch (e) {
      setError(`${t('ble.saveFailed')}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleScan = async () => {
    setError('')
    try {
      await connectionRef.current?.requestScan()
    } catch (e) {
      setError(`${t('ble.scanFailed')}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const toggleReveal = (field: FieldName) =>
    setRevealed((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]))

  // One line under the SSID field: what the scan is doing, or how old the list is.
  const scanHelp =
    scan === null
      ? undefined
      : scan.state === 'SCANNING'
        ? t('ble.scanning')
        : scan.state === 'UNAVAILABLE'
          ? t('ble.scanUnavailable')
          : networks.length === 0
            ? t('ble.noNetworks')
            : scan.ageSeconds !== null && scan.ageSeconds > 0
              ? t('ble.resultsAge', { found: networks.length, seconds: scan.ageSeconds })
              : t('ble.resultsFresh', { found: networks.length })

  const heading = (
    <CardTitle id="ble-title" step={step}>
      {t('ble.title')}
    </CardTitle>
  )

  if (!available || !hasRadio) {
    return (
      <Card glass labelledBy="ble-title" className="w-full max-w-[330px] space-y-3 lg:max-w-[400px]">
        {heading}
        <Notice tone="info" title={t(!available ? 'ble.unavailable' : 'ble.noRadio')}>
          {!available && os === 'linux' && <p className="mt-1">{t('ble.linuxHint')}</p>}
        </Notice>
      </Card>
    )
  }

  return (
    <Card glass labelledBy="ble-title" className="w-full max-w-[330px] space-y-3 lg:max-w-[400px]">
      <CardTitle
        id="ble-title"
        step={step}
        aside={isConnected ? <Pill tone="success">{deviceName}</Pill> : undefined}
      >
        {t('ble.title')}
      </CardTitle>

      <p className="text-left text-[13px] leading-relaxed text-muted-foreground">
        {isConnected ? t('ble.description') : t('ble.setupModeHint')}
      </p>

      <Button
        className="w-full"
        onClick={isConnected ? handleDisconnect : handleConnect}
        disabled={busy}
      >
        {isConnected ? t('ble.disconnect') : t('ble.connect')}
        <Bluetooth />
      </Button>

      {isConnected && (
        <>
          {FIELD_ORDER.map((field) => {
            const secret = SECRET.has(field)
            const shown = revealed.includes(field)
            // Only the SSID gets the scan affordance, and only where the
            // firmware carries the extension.
            const scannable = field === 'wifiSsid' && canScan
            return (
              <Field
                key={field}
                label={t(`ble.${field}`)}
                htmlFor={`ble-${field}`}
                help={scannable ? scanHelp : undefined}
              >
                <div className="flex gap-2">
                  <input
                    id={`ble-${field}`}
                    className={inputClass}
                    type={secret && !shown ? 'password' : 'text'}
                    inputMode={field === 'poolPort' ? 'numeric' : undefined}
                    maxLength={FIELDS[field].maxBytes}
                    value={values[field]}
                    disabled={busy}
                    autoComplete="off"
                    // Stays free text even with a list: a hidden network, or one
                    // that did not answer this scan, still has to be typeable.
                    list={scannable ? 'ble-ssid-options' : undefined}
                    onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                  />
                  {secret && (
                    <Button
                      variant="outline"
                      aria-label={t(shown ? 'ble.hide' : 'ble.show')}
                      onClick={() => toggleReveal(field)}
                    >
                      {shown ? <EyeOff /> : <Eye />}
                    </Button>
                  )}
                  {scannable && (
                    <Button
                      variant="outline"
                      aria-label={t('ble.scan')}
                      title={t('ble.scan')}
                      onClick={handleScan}
                      disabled={busy || scan?.state === 'SCANNING'}
                    >
                      <RadioTower />
                    </Button>
                  )}
                </div>
                {scannable && (
                  <datalist id="ble-ssid-options">
                    {networks.map((network) => (
                      <option key={`${network.ssid}-${network.channel}`} value={network.ssid}>
                        {network.rssi} dBm
                        {network.auth === 0 ? ` \u00b7 ${t('ble.openNetwork')}` : ''}
                      </option>
                    ))}
                  </datalist>
                )}
              </Field>
            )
          })}

          <Button className="w-full" onClick={handleSave} disabled={busy}>
            {t('ble.save')}
            <Save />
          </Button>

          {status === 'APPLIED_RESTART_REQUIRED' && (
            <Button className="w-full" variant="outline" onClick={handleRestart} disabled={busy}>
              {t('ble.restart')}
              <RotateCw />
            </Button>
          )}

          {phase !== 'idle' && (
            // Same component the flasher card uses, so both panels describe a
            // long operation identically — including to a screen reader.
            <ProgressReadout
              tone={phaseTone[phase]}
              label={t(`ble.phase.${phase}`)}
              percent={percent}
              // The firmware's own words when it has any, ours for the
              // stretches it says nothing about. Unknown statuses show
              // verbatim rather than as a missing key.
              status={
                activity !== ''
                  ? activity
                  : status !== ''
                    ? t(`ble.status.${status}`, { defaultValue: status })
                    : ''
              }
              showBar={RUNNING.has(phase) || phase === 'applied'}
            />
          )}
        </>
      )}

      {error !== '' && (
        <Notice tone="danger" role="alert" title={t('ble.failed')}>
          <p className="mt-1">{error}</p>
        </Notice>
      )}
    </Card>
  )
}
