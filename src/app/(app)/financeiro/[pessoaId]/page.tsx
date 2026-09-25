import type { Metadata } from 'next'
import { forbidden, notFound } from 'next/navigation'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Dinheiro } from '@/components/Dinheiro'
import { Button } from '@/components/ui/button'
import { ListaObrigacoes } from '@/features/financeiro/componentes/ListaObrigacoes'
import { extrato } from '@/features/financeiro/consultas'
import { nomeDoMes } from '@/features/grupo/textos'
import { paginaExige } from '@/server/auth/guardas'
import { agora } from '@/server/relogio'

export const metadata: Metadata = { title: 'Extrato' }

// 07 §3.6: extrato da pessoa. MEMBRO vê o de qualquer um (art. 39); EX_* só o próprio (RN-ACE-07).
export default async function ExtratoPage({ params }: PageProps<'/financeiro/[pessoaId]'>) {
  const eu = await paginaExige(['MEMBRO', 'EX_COM_PENDENCIA', 'EX_QUITADO'])
  const { pessoaId } = await params
  if (eu.perfil !== 'MEMBRO' && pessoaId !== eu.pessoaId) forbidden()
  const t = agora()
  const e = await extrato(pessoaId, t)
  if (!e) notFound()

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6 print:max-w-none">
      <CabecalhoPagina
        titulo={`Extrato de ${e.pessoa.apelido}`}
        descricao={
          <>
            Deve em aberto <Dinheiro centavos={e.totais.devoAberto} className="font-medium" /> · a
            receber <Dinheiro centavos={e.totais.receboAberto} className="font-medium" /> ·{' '}
            {e.totais.atrasos} atraso(s)
          </>
        }
        acoes={
          eu.pessoaId === pessoaId && (
            <Button asChild variant="outline">
              <a href="/api/exportar?formato=json">Exportar meus dados</a>
            </Button>
          )
        }
      />
      {e.contemplacoes.length > 0 && (
        <section aria-labelledby="premios" className="flex flex-col gap-2">
          <h2 id="premios" className="text-lg font-semibold">
            Contemplações
          </h2>
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {e.contemplacoes.map((c) => (
              <li key={c.id} className="flex justify-between px-4 py-2">
                <span>
                  Ciclo {c.ciclo.numero}, rodada {c.sequencia} ({nomeDoMes(c.mesReferencia)})
                </span>
                <span>
                  PRÊMIO nominal <Dinheiro centavos={c.premioCentavos} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="devo" className="flex flex-col gap-2">
        <h2 id="devo" className="text-lg font-semibold">
          Deve
        </h2>
        {e.devo.length > 0 ? (
          <ListaObrigacoes obrigacoes={e.devo} eu={eu.pessoaId} agora={t} mostrarRodada />
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma obrigação.</p>
        )}
      </section>
      <section aria-labelledby="recebe" className="flex flex-col gap-2">
        <h2 id="recebe" className="text-lg font-semibold">
          A receber
        </h2>
        {e.recebo.length > 0 ? (
          <ListaObrigacoes obrigacoes={e.recebo} eu={eu.pessoaId} agora={t} mostrarRodada />
        ) : (
          <p className="text-sm text-muted-foreground">Nada a receber.</p>
        )}
      </section>
    </div>
  )
}
