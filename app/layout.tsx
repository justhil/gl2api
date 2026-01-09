import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Gumloop 2API',
  description: 'Gumloop to API proxy service',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
