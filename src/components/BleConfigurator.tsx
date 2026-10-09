'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bluetooth, Eye, EyeOff, RotateCw, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from './ui/button'
import { Card, CardTitle, Field, Notice, Pill, type PillTone } from './ui/pm'
import {
  FIELDS,
  FIELD_ORDER,
  FieldTooLongError,
  connectToMiner,
  hasBluetoothRadio,
  type FieldName,
  type FieldValues,
  type MinerConnection,
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

function statusTone(status: string): PillTone {
  if (status.startsWith('ERROR')) return 'danger'
  if (status === 'APPLIED_RESTART_REQUIRED') return 'success'
  if (status === 'READY' || status === '') return 'neutral'
  return 'info'
}

export default function BleConfigurator({ available, os }: { available: boolean; os: OS }) {
  const { t } = useTranslation()

  const connectionRef = useRef<MinerConnection | null>(null)
  const [deviceName, setDeviceName] = useState('')
  const [values, setValues] = useState<FieldValues>(EMPTY)
  // What the miner reported on connect, so Save writes only what changed.
  const [saved, setSaved] = useState<FieldValues>(EMPTY)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revealed, setRevealed] = useState<FieldName[]>([])
  const [hasRadio, setHasRadio] = useState(true)

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
    setRevealed([])
  }, [])

  // Drop the link if the card goes away mid-session.
  useEffect(() => () => connectionRef.current?.disconnect(), [])

  const handleConnect = async () => {
    setError('')
    setBusy(true)
    try {
      const miner = await connectToMiner()
      connectionRef.current = miner
      // A RESTART always drops the link, so treat this as a normal ending.
      miner.onDisconnected(reset)
      await miner.watchStatus(setStatus)
      const current = await miner.readAll()
      setValues(current)
      setSaved(current)
      setDeviceName(miner.name)
    } catch (e) {
      // Dismissing the chooser rejects with NotFoundError; that is not an error.
      if (!(e instanceof DOMException && e.name === 'NotFoundError')) {
        setError(`${t('ble.connectFailed')}: ${e instanceof Error ? e.message : String(e)}`)
      }
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
    try {
      // Only touched fields are written, so anything left alone keeps its
      // current value on the miner.
      for (const field of FIELD_ORDER) {
        if (values[field] !== saved[field]) {
          await miner.write(field, values[field])
        }
      }
      await miner.sendCommand('APPLY')
      setSaved(values)
    } catch (e) {
      if (e instanceof FieldTooLongError) {
        setError(t('ble.tooLong', { field: t(`ble.${e.field}`), max: e.maxBytes }))
      } else {
        setError(`${t('ble.saveFailed')}: ${e instanceof Error ? e.message : String(e)}`)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleRestart = async () => {
    setError('')
    setBusy(true)
    try {
      await connectionRef.current?.sendCommand('RESTART')
    } catch (e) {
      setError(`${t('ble.saveFailed')}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const toggleReveal = (field: FieldName) =>
    setRevealed((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]))

  const heading = (
    <CardTitle id="ble-title">
      {t('ble.title')}
    </CardTitle>
  )

  if (!available || !hasRadio) {
    return (
      <Card glass labelledBy="ble-title" className="w-full max-w-[420px] space-y-3">
        {heading}
        <Notice tone="info" title={t(!available ? 'ble.unavailable' : 'ble.noRadio')}>
          {!available && os === 'linux' && <p className="mt-1">{t('ble.linuxHint')}</p>}
        </Notice>
      </Card>
    )
  }

  return (
    <Card glass labelledBy="ble-title" className="w-full max-w-[420px] space-y-3">
      <CardTitle id="ble-title" aside={isConnected ? <Pill tone="success">{deviceName}</Pill> : undefined}>
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
            return (
              <Field key={field} label={t(`ble.${field}`)} htmlFor={`ble-${field}`}>
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
                </div>
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

          {status !== '' && (
            <div className="flex justify-center">
              {/* Unknown statuses show verbatim rather than as a missing key,
                  so newer firmware never renders as blank. */}
              <Pill tone={statusTone(status)}>{t(`ble.status.${status}`, { defaultValue: status })}</Pill>
            </div>
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
