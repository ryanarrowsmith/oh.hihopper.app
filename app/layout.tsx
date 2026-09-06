import type { Metadata } from 'next'
import './globals.css'
import { Colophon } from '@/components/Colophon'

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
        {/* Google tag (gtag.js). Same measurement ID as every other Oh hi
            site on purpose: one property, split by Hostname in GA. Cross-domain
            linking has to list every domain, or a hop between our own sites
            reads as a new user arriving on a self-referral. */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-QTGTWCZ6WD" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-QTGTWCZ6WD')",
          }}
        />
      </head>
      <body>
        {children}
        {/* Under the container, on the ground it floats on. Generated from
            ohhi/site/lib/template.ts along with every other Oh hi surface. */}
        <div className="footwrap"><Colophon /></div>
      </body>
    </html>
  )
}
