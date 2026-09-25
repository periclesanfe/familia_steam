import type { Metadata } from 'next'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { FormNovaVotacao } from '@/features/votacoes/componentes/FormNovaVotacao'
import { opcoesDeConvocacao } from '@/features/votacoes/consultas'
import { paginaExige } from '@/server/auth/guardas'
import { agora } from '@/server/relogio'

export const metadata: Metadata = { title: 'Convocar votação' }

// 07 §3.7: formulário específico do efeito (?assunto= pré-seleciona).
export default async function NovaVotacaoPage({ searchParams }: PageProps<'/votacoes/nova'>) {
  await paginaExige(['MEMBRO'])
  const [{ assunto }, opcoes] = await Promise.all([searchParams, opcoesDeConvocacao(agora())])
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo="Convocar votação"
        descricao="Qualquer membro convoca; o sistema nunca convoca sozinho (RN-VOT-11)."
      />
      <FormNovaVotacao
        opcoes={opcoes}
        {...(typeof assunto === 'string' ? { assuntoInicial: assunto } : {})}
      />
    </div>
  )
}
