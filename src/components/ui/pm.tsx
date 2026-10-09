import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/*
 * Building blocks of the Power Mining page language, trimmed from the Bitcube
 * dashboard's pm.tsx to the parts a flasher actually uses: glass cards, quiet
 * pills, notices, labelled fields. Pages compose these instead of styling each
 * surface by hand. Tokens live in src/app/globals.css.
 */

export function Card({
  children,
  className,
  glass = false,
  labelledBy,
}: {
  children: ReactNode
  className?: string
  /** Real backdrop-filter glass, for surfaces sitting over the ambient blobs. */
  glass?: boolean
  labelledBy?: string
}) {
  return (
    <section aria-labelledby={labelledBy} className={cn(glass ? "pm-glass p-5 sm:p-[26px]" : "pm-card", className)}>
      {children}
    </section>
  )
}

export function CardTitle({
  id,
  children,
  aside,
  className,
}: {
  id?: string
  children: ReactNode
  aside?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <h2 id={id} className="text-lg font-semibold tracking-[-0.3px] text-foreground">
        {children}
      </h2>
      {aside}
    </div>
  )
}

export type PillTone = "success" | "warning" | "danger" | "neutral" | "info"

const pillTone: Record<PillTone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-destructive/10 text-destructive",
  neutral: "bg-secondary text-muted-foreground",
  info: "bg-info-soft text-primary",
}

export function Pill({ tone = "neutral", children, className }: { tone?: PillTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-pill px-[9px] py-1 text-xs font-medium leading-none",
        pillTone[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export type NoticeTone = "warning" | "danger" | "info"

/** Banner under a heading: an amber "!" for problems, a blue "i" for guidance. */
export function Notice({
  tone = "warning",
  title,
  children,
  actions,
  role = "status",
  className,
}: {
  tone?: NoticeTone
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  role?: "status" | "alert"
  className?: string
}) {
  return (
    <div
      role={role}
      className={cn(
        "flex gap-3.5 rounded-2xl border px-4 py-4 text-left sm:px-[21px] sm:py-[18px]",
        tone === "warning" && "border-warning-line bg-warning-soft",
        tone === "danger" && "border-destructive/25 bg-destructive/10",
        tone === "info" && "border-info-line bg-info-soft",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] text-[11px] font-bold leading-none",
          tone === "warning" && "border-warning text-warning",
          tone === "danger" && "border-destructive text-destructive",
          tone === "info" && "border-primary text-primary",
        )}
      >
        {tone === "info" ? "i" : "!"}
      </span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-foreground/85">
        <p className="font-semibold text-foreground">{title}</p>
        {children}
        {actions != null && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{actions}</div>}
      </div>
    </div>
  )
}

/** Blue text button used inside notices and card heads. */
export function TextButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-pill text-[13px] font-medium text-primary underline-offset-[3px] hover:underline disabled:opacity-50 disabled:hover:no-underline",
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Field({
  label,
  htmlFor,
  help,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  help?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("min-w-0 space-y-2 text-left", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {help != null && <p className="text-[13px] leading-relaxed text-muted-foreground">{help}</p>}
    </div>
  )
}
