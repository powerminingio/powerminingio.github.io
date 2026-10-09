import { Zap, Wifi, Cpu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card } from './ui/pm'

export default function Features() {
  const { t } = useTranslation();

  return (
    <section id="features" className="relative z-10 mx-auto w-full max-w-[1100px] px-4 py-12 sm:px-8 md:py-20">
      <h2 className="mb-8 text-center text-2xl font-bold tracking-[-0.02em]">{t('features.title')}</h2>
      <div className="grid gap-5 md:grid-cols-3">
        <FeatureCard
          icon={<Zap className="h-7 w-7 text-primary" />}
          title={t('features.fastFlashing.title')}
          description={t('features.fastFlashing.description')}
        />
        <FeatureCard
          icon={<Wifi className="h-7 w-7 text-primary" />}
          title={t('features.webBased.title')}
          description={t('features.webBased.description')}
        />
        <FeatureCard
          icon={<Cpu className="h-7 w-7 text-primary" />}
          title={t('features.multipleBoards.title')}
          description={t('features.multipleBoards.description')}
        />
      </div>
    </section>
  )
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card className="flex flex-col items-center text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-tile bg-info-soft">{icon}</span>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </Card>
  )
}
