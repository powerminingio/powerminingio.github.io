import Link from 'next/link'
import { useEffect, useRef, type ReactNode } from 'react'
import { useState } from 'react'
import { X } from 'lucide-react'

/**
 * Native <dialog> rather than a hand-rolled overlay: Escape, the focus trap and
 * the top layer come for free, and ::backdrop carries the scrim. The centring
 * margin is restored in globals.css, which Tailwind's preflight would otherwise
 * strip.
 */
function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="max-w-md rounded-card border border-[var(--card-line)] bg-card p-6 text-foreground shadow-menu backdrop:bg-foreground/40 backdrop:backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 rounded-pill p-1 text-muted-foreground transition-colors hover:bg-foreground/[.035] hover:text-foreground"
      >
        <X size={22} />
      </button>
      <div className="pr-8 text-center">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{children}</p>
      </div>
    </dialog>
  )
}

export default function Footer() {
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [showTermsOfService, setShowTermsOfService] = useState(false)

  return (
    <>
      <Modal open={showPrivacy} onClose={() => setShowPrivacy(false)} title="Privacy Notice">
        We collect no data but your ISP does.
      </Modal>

      <Modal open={showTermsOfService} onClose={() => setShowTermsOfService(false)} title="Terms">
        The source code is provided under GPL-V3 License.
      </Modal>

      <footer className="relative z-10 mx-auto flex w-full max-w-[1100px] shrink-0 flex-col items-center gap-2 border-t border-border px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-8">
        <p>© 2025 Power Mining. Web Flasher.</p>
        <Link className="hover:text-foreground hover:underline underline-offset-4" href="https://wantclue.de">
          Maintained by WantClue
        </Link>
        <nav className="flex gap-4 sm:ml-auto sm:gap-6">
          <button
            onClick={() => setShowTermsOfService(true)}
            className="rounded-pill hover:text-foreground hover:underline underline-offset-4"
          >
            Terms of Service
          </button>
          <button
            onClick={() => setShowPrivacy(true)}
            className="rounded-pill hover:text-foreground hover:underline underline-offset-4"
          >
            Privacy
          </button>
        </nav>
      </footer>
    </>
  )
}
