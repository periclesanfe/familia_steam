import type { Metadata } from 'next'
import Link from 'next/link'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Button } from '@/components/ui/button'
import { TabelaAnexoI } from '@/features/regulamento/componentes/TabelaAnexoI'
import { anexoI } from '@/features/regulamento/consultas'
import { paginaExige } from '@/server/auth/guardas'

export const metadata: Metadata = { title: 'Anexo I' }

// 07 §3.9 / RN-BLO: Lista de Jogos Bloqueados, vigentes e excluídas.
export default async function BloqueadosPage() {
  await paginaExige(['MEMBRO'])
  const entradas = await anexoI()
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo="Anexo I: Lista de Jogos Bloqueados"
        descricao="Entradas só por veto aprovado; exclusão só por votação (art. 23). A 01 só sai alterando o art. 17."
        acoes={
          <Button asChild variant="outline">
            <Link href="/votacoes/nova?assunto=EXCLUSAO_BLOQUEIO">Propor exclusão</Link>
          </Button>
        }
      />
      <TabelaAnexoI entradas={entradas} />
    </div>
  )
}
