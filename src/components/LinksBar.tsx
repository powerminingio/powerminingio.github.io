'use client'

import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'

export default function LinksBar() {
  const { t } = useTranslation();

  const purchaseLinks = [
    { region: t('links.regions.us'), url: "https://dub.sh/lIWhNgZ" },
    { region: t('links.regions.eu'), url: "https://dub.sh/tmPs27j" },
    { region: t('links.regions.de'), url: "https://dub.sh/NtisWzh" },
    { region: t('links.regions.uk'), url: "https://dub.sh/5EXOLfW" },
    { region: t('links.regions.global'), url: "https://dub.sh/HoGhuGr" },
  ]

  return (
    <section className="relative z-10 mx-auto w-full max-w-[1100px] px-4 pb-8 pt-4 sm:px-8">
      <div className="mb-6 text-center">
        <h2 className="mb-2 text-2xl font-bold tracking-[-0.02em]">{t('links.title')}</h2>
        <p className="text-muted-foreground">{t('links.subtitle')}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {purchaseLinks.map((link, index) => (
          <Button key={index} variant="outline" size="sm" asChild>
            <a href={link.url} target="_blank" rel="noopener noreferrer">
              <span>{link.region}</span>
              <ExternalLink />
            </a>
          </Button>
        ))}
      </div>
    </section>
  )
}
