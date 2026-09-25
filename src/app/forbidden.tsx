import Link from 'next/link'

// 12 §6: acesso negado pelo guard (RN-ACE-03), com status 403.
export default function Proibido() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Acesso restrito</h1>
      <p className="text-sm text-muted-foreground">
        Esta área não está disponível para o seu perfil no consórcio.
      </p>
      <Link href="/" className="text-sm font-medium underline underline-offset-4">
        Voltar ao painel
      </Link>
    </main>
  )
}
