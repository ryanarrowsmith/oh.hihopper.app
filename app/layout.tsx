import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hopper',
  description: 'The home to your loose bits.',
  metadataBase: new URL('https://oh.hihopper.app'),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&family=Caveat:wght@600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
