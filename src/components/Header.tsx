import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import LanguageSelector from './LanguageSelector'
import { asset } from '@/lib/utils'

interface HeaderProps {
  onOpenPanel: () => void;
  isPanelOpen?: boolean;
}

/**
 * Header after the Power Mining pattern: the wordmark on the left, quiet pill
 * tabs on the right. An inactive tab is plain text and only the active one is
 * a shape.
 */
const tabClass =
  'inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-pill px-[17px] text-sm text-muted-foreground transition-colors hover:bg-foreground/[.035] hover:text-foreground'

export default function Header({ onOpenPanel, isPanelOpen = false }: HeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="mx-auto w-full max-w-[1100px] px-4 pt-5 sm:px-8 sm:pt-[27px]">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" aria-label="Power Mining — Home" className="inline-flex shrink-0 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset('/pictures/pm-logo.svg')}
            alt="Power Mining"
            className="h-[22px] w-auto sm:h-6"
          />
        </Link>

        <nav className="flex min-w-0 items-center gap-[3px]">
          <Link className={`${tabClass} hidden sm:inline-flex`} href="#features">
            {t('header.features')}
          </Link>
          <button
            type="button"
            className={`${tabClass} ${isPanelOpen ? 'bg-segment-on text-foreground shadow-pill hover:bg-segment-on' : ''}`}
            onClick={onOpenPanel}
          >
            {t('hero.getStarted')}
          </button>
          <LanguageSelector />
        </nav>
      </div>
    </header>
  )
}
