import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _inter = Inter({ subsets: ["latin"] });
const _jetbrainsMono = JetBrains_Mono({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: '#e03e36',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'SolCon Template',
  description: 'PWA template with Braze + DemoBridge wiring and validation',
  manifest: '/manifest.json',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased flex min-h-screen items-start justify-center bg-black/90 py-6">
        <div className="relative mx-auto w-full max-w-[390px] min-h-[844px] overflow-hidden rounded-[2.5rem] border-[3px] border-white/10 bg-background shadow-2xl shadow-black/50">
          {/* Status bar notch */}
          <div className="sticky top-0 z-50 flex items-center justify-center pb-1 pt-3">
            <div className="h-[26px] w-[120px] rounded-full bg-black" />
          </div>
          {/* App content */}
          <div className="overflow-y-auto">
            {children}
          </div>
        </div>
        <Analytics />
      </body>
    </html>
  )
}
