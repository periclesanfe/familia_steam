import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { cookies } from 'next/headers'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'

import './globals.css'

// Fontes auto-hospedadas pelo next/font (sem requisição a terceiros em runtime).
const sans = Geist({ variable: '--font-sans', subsets: ['latin'] })
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'Família Steam', template: '%s · Família Steam' },
  description: 'Controle do Consórcio da Família Steam',
}

// 12 UI-04: cor da barra do navegador acompanha o tema do sistema
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // 12 UI-04 (rev. M10): a escolha do alternador vem em cookie; sem escolha, vale o sistema
  const tema = (await cookies()).get('tema')?.value
  const classeTema = tema === 'escuro' ? 'dark' : tema === 'claro' ? 'light' : ''
  return (
    <html
      lang="pt-BR"
      className={`${sans.variable} ${mono.variable} ${classeTema} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  )
}
