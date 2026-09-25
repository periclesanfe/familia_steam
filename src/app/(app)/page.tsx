import { paginaExige } from '@/server/auth/guardas'

// 07 §3.3: Painel (pendências e "agora" entram nos marcos seguintes).
export default async function PainelPage() {
  await paginaExige(['MEMBRO', 'EX_COM_PENDENCIA', 'EX_QUITADO'])
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Família Steam</h1>
    </div>
  )
}
