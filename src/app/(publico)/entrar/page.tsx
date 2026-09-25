import type { Metadata } from 'next'

import { Alert, AlertDescription } from '@/components/ui/alert'

export const metadata: Metadata = { title: 'Entrar' }

const ERROS = {
  nao_autorizado: 'Esta conta Steam não está autorizada.',
  falha: 'Não foi possível entrar. Tente de novo.',
  expirado: 'A tentativa de login expirou. Tente de novo.',
  limite: 'Muitas tentativas seguidas. Aguarde um minuto.',
} as const

// 07 §3.1: login só com Steam; erros neutros por ?erro=.
export default async function EntrarPage({ searchParams }: PageProps<'/entrar'>) {
  const { erro } = await searchParams
  const mensagem =
    typeof erro === 'string' && erro in ERROS ? ERROS[erro as keyof typeof ERROS] : null

  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-b from-primary/10 via-background to-background px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- ícone SVG do próprio app */}
          <img src="/icon.svg" alt="" width={64} height={64} className="size-16" />
          <h1 className="text-2xl font-semibold tracking-tight">Família Steam</h1>
          <p className="text-sm text-muted-foreground">
            Sua família Steam organizada: biblioteca compartilhada, lista de desejos e o consórcio
            do jogo do mês. Entre com a sua conta Steam.
          </p>
        </div>
        {mensagem && (
          <Alert variant="destructive">
            <AlertDescription>{mensagem}</AlertDescription>
          </Alert>
        )}
        {/* Link (GET), não formulário: a navegação até a Steam não é mutação (14 SEG-03) */}
        <a
          href="/api/auth/steam"
          className="self-center rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {/* Botão oficial da Valve (12 UI-12); a v1 do lucide não tem ícones de marca */}
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem estática de 6 KB, sem otimizador */}
          <img src="/steam/entrar-com-steam.png" alt="Entrar com Steam" width={180} height={35} />
        </a>
        <p className="text-center text-xs text-muted-foreground">
          Não afiliado à Valve Corporation.
        </p>
      </div>
    </main>
  )
}
