import type { Metadata } from 'next'
import './globals.css'
import { I18nProvider } from '../components/I18nProvider'

// Icons come from src/app/icon.png and src/app/apple-icon.png by Next's file
// convention, so their URLs track the build's basePath on their own.
export const metadata: Metadata = {
  title: 'Power Mining Web Flasher',
  description: 'Flash your miner directly from the web',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {/* Ambient blobs sit outside I18nProvider, which renders null until its
            effect runs — inside, first paint would be bare white. */}
        <div className="pm-bg" aria-hidden="true">
          <div className="pm-blob b1" />
          <div className="pm-blob b2" />
          <div className="pm-blob b3" />
        </div>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  )
}
