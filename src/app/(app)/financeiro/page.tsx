import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Dinheiro } from '@/components/Dinheiro'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { ListaObrigacoes } from '@/features/financeiro/componentes/ListaObrigacoes'
import { quemDeveAQuem } from '@/features/financeiro/consultas'
import { paginaExige } from '@/server/auth/guardas'
import { agora } from '@/server/relogio'

export const metadata: Metadata = { title: 'Financeiro' }

// 07 §3.6 / RN-FIN-19: quem deve a quem e obrigações abertas (?vencidas=1). EX_* vê o próprio extrato.
export default async function FinanceiroPage({ searchParams }: PageProps<'/financeiro'>) {
  const { pessoaId, perfil } = await paginaExige(['MEMBRO', 'EX_COM_PENDENCIA', 'EX_QUITADO'])
  if (perfil !== 'MEMBRO') redirect(`/financeiro/${pessoaId}`)
  const { vencidas } = await searchParams
  const t = agora()
  const { pares, abertas } = await quemDeveAQuem(t)
  const lista = vencidas === '1' ? abertas.filter((o) => o.vencimentoEfetivo <= t) : abertas

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo="Financeiro"
        descricao="Obrigações entre pessoas: o consórcio não guarda dinheiro (art. 3º, p.u.)."
        acoes={
          <>
            <Button asChild variant="outline">
              <a href="/api/exportar?formato=json">Exportar (JSON)</a>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/financeiro/${pessoaId}`}>Meu extrato</Link>
            </Button>
          </>
        }
      />
      <section aria-labelledby="quem-deve" className="flex flex-col gap-3">
        <h2 id="quem-deve" className="text-lg font-semibold">
          Quem deve a quem
        </h2>
        {pares.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Nada em aberto</EmptyTitle>
              <EmptyDescription>Todas as obrigações estão quitadas.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <caption className="sr-only">Saldos abertos por devedor e credor</caption>
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Devedor
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Credor
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Em aberto
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Vencido
                  </th>
                </tr>
              </thead>
              <tbody>
                {pares.map((p) => (
                  <tr key={`${p.devedorId}>${p.credorId}`} className="border-t">
                    <td className="px-3 py-2">
                      <Link
                        href={`/financeiro/${p.devedorId}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {p.devedor}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{p.credor}</td>
                    <td className="px-3 py-2 text-right">
                      <Dinheiro centavos={p.total} />
                    </td>
                    <td
                      className={
                        p.vencido > 0
                          ? 'px-3 py-2 text-right font-medium text-destructive'
                          : 'px-3 py-2 text-right text-muted-foreground'
                      }
                    >
                      {p.vencido > 0 ? <Dinheiro centavos={p.vencido} /> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section aria-labelledby="abertas" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="abertas" className="text-lg font-semibold">
            Obrigações abertas
          </h2>
          <Link
            href={vencidas === '1' ? '/financeiro' : '/financeiro?vencidas=1'}
            className="text-sm underline underline-offset-4"
          >
            {vencidas === '1' ? 'Mostrar todas' : 'Só as vencidas'}
          </Link>
        </div>
        {lista.length > 0 && (
          <ListaObrigacoes obrigacoes={lista} eu={pessoaId} agora={t} mostrarRodada />
        )}
      </section>
    </div>
  )
}
