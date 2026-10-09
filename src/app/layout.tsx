import type { Metadata } from 'next'
import './globals.css'
import { I18nProvider } from '../components/I18nProvider'
import { asset } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Bitaxe Web Flasher — Power Mining',
  description: 'Flash your Bitaxe directly from the web',
  icons: {
    icon: [
      {
        url: asset('/pictures/pm-favicon.png'),
        sizes: 'any',
        type: 'image/png',
      }
    ],
    apple: [
      {
        url: asset('/pictures/pm-mark.png'),
        type: 'image/png',
      }
    ]
  }
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
