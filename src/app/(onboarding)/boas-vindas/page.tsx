import type { Metadata } from 'next'

import { paginaExige } from '@/server/auth/guardas'

export const metadata: Metadata = { title: 'Boas-vindas' }

// RN-ACE-06: onboarding do PENDENTE (formulário completo no próximo bloco do M2).
export default async function BoasVindasPage() {
  await paginaExige(['PENDENTE'])
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Boas-vindas</h1>
    </main>
  )
}
