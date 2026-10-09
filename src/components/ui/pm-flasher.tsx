import { forwardRef, type ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { Pill, type PillTone } from './pm'

/*
 * The three pieces the flasher needs that neither Power Mining property has:
 * a progress readout, a compact ring for the button, and the rental site's
 * macOS terminal window for the serial log.
 */

export type FlashPhase =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'preparing'
  | 'downloading'
  | 'flashing'
  | 'done'
  | 'error'

const phaseTone: Record<FlashPhase, PillTone> = {
  idle: 'neutral',
  connecting: 'info',
  connected: 'info',
  preparing: 'info',
  downloading: 'info',
  flashing: 'info',
  done: 'success',
  error: 'danger',
}

/**
 * Progress for a flash. The phase is written out as well as coloured, and the
 * sentence underneath is the existing translated status string — the bar is
 * presentation layered over copy that already works in nine languages.
 */
export function FlashProgress({
  phase,
  percent,
  status,
  label,
}: {
  phase: FlashPhase
  /** null while a phase is running with nothing to report. */
  percent: number | null
  /** The human sentence, already translated. */
  status: string
  /** The phase, already translated. */
  label: string
}) {
  const busy = phase !== 'idle' && phase !== 'done' && phase !== 'error'
  const showBar = busy || phase === 'done'

  return (
    <div className="space-y-2 text-left">
      <div className="flex items-center justify-between gap-3">
        <Pill tone={phaseTone[phase]}>{label}</Pill>
        {percent != null && (
          <span className="text-[13px] font-medium tabular-nums text-muted-foreground">{percent}%</span>
        )}
      </div>

      {showBar && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
          aria-valuetext={status}
          className="h-2 w-full overflow-hidden rounded-pill bg-foreground/[.08]"
        >
          {percent != null ? (
            <div
              className="h-full rounded-pill bg-primary transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          ) : (
            <div className="h-full w-1/4 rounded-pill bg-primary/70 animate-pm-indeterminate motion-reduce:w-full motion-reduce:opacity-40" />
          )}
        </div>
      )}

      {status !== '' && (
        <p aria-live="polite" className="text-[13px] leading-relaxed text-muted-foreground">
          {status}
        </p>
      )}
    </div>
  )
}

/**
 * Compact progress ring for inside a button, after the rental site's warm-up
 * donut. Track and fill both come from tokens so it stays in step with the page.
 */
export function ProgressRing({ percent, title }: { percent: number | null; title?: string }) {
  const C = 2 * Math.PI * 5
  const dash = percent == null ? C * 0.25 : (percent / 100) * C

  return (
    <svg viewBox="0 0 14 14" role="img" aria-hidden={title == null} className="h-4 w-4">
      {title != null && <title>{title}</title>}
      <circle cx="7" cy="7" r="5" fill="none" stroke="hsl(var(--info-line))" strokeWidth="2.5" />
      <circle
        cx="7"
        cy="7"
        r="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${dash.toFixed(2)} ${C.toFixed(2)}`}
        transform="rotate(-90 7 7)"
      />
    </svg>
  )
}

/**
 * The rental site's macOS terminal window. The traffic lights are decorative;
 * the state is carried by the pill on the right, in words.
 */
export const MacTerm = forwardRef<HTMLDivElement, { title: string; aside?: ReactNode; className?: string }>(
  function MacTerm({ title, aside, className }, ref) {
    return (
      <div className={cn('pm-glass overflow-hidden text-left shadow-term', className)}>
        <div className="flex items-center gap-[7px] border-b border-black/[.06] px-[13px] py-[9px]">
          <span aria-hidden="true" className="h-[11px] w-[11px] rounded-full bg-[#FF5F57]" />
          <span aria-hidden="true" className="h-[11px] w-[11px] rounded-full bg-[#FEBC2E]" />
          <span aria-hidden="true" className="h-[11px] w-[11px] rounded-full bg-[#28C840]" />
          <span className="flex-1 truncate text-center text-[11.5px] text-muted-foreground">{title}</span>
          {aside}
        </div>
        <div ref={ref} className="h-[400px] px-[14px] pb-3 pt-[10px]" />
      </div>
    )
  },
)
