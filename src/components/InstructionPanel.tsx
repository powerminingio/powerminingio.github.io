import { X } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface InstructionPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InstructionPanel({ isOpen, onClose }: InstructionPanelProps) {
  const { t } = useTranslation();
  const steps = [1, 2, 3, 4, 5, 6, 7];

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  return (
    // The panel stays mounted so it can slide. Hidden from the tab order and
    // the accessibility tree while it is off-screen.
    <div
      role="dialog"
      aria-label={t('instructions.title')}
      aria-hidden={!isOpen}
      className={`fixed right-4 top-[5vh] z-50 max-h-[80vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-card border border-[var(--card-line)] bg-card/95 p-5 shadow-menu transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : 'pointer-events-none translate-x-[calc(100%+1rem)]'
      }`}
    >
      <button
        className="absolute right-3 top-3 rounded-pill p-1 text-muted-foreground transition-colors hover:bg-foreground/[.035] hover:text-foreground"
        onClick={onClose}
        aria-label={t('common.close')}
        tabIndex={isOpen ? 0 : -1}
      >
        <X className="h-5 w-5" />
      </button>
      <h2 className="mb-4 pr-8 text-xl font-semibold">{t('instructions.title')}</h2>
      <ol className="list-inside list-decimal space-y-2 text-sm leading-relaxed">
        {steps.map((step) => (
          <li key={step}>{t(`instructions.steps.${step}`)}</li>
        ))}
      </ol>
      <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
        {t('instructions.moreInfo')}{' '}
        <a
          className="text-primary underline-offset-[3px] hover:underline"
          href="https://www.osmu.wiki"
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={isOpen ? 0 : -1}
        >
          {t('instructions.documentation')}
        </a>.
      </p>
    </div>
  )
}
