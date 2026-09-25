import Link from 'next/link'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { nomeDoMes } from '@/features/grupo/textos'
import { proximoSorteio } from '@/features/rodadas/consultas'
import { formatarDataHora } from '@/lib/formato'
import { paginaExige } from '@/server/auth/guardas'

// 07 §3.3: Painel. "Agora" no M4; as pendências completas entram no M9.
export default async function PainelPage() {
  const { perfil } = await paginaExige(['MEMBRO', 'EX_COM_PENDENCIA', 'EX_QUITADO'])
  const proximo = perfil === 'MEMBRO' ? await proximoSorteio() : null

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina titulo="Painel" />
      <Card>
        <CardHeader>
          <CardTitle>Agora</CardTitle>
          <CardDescription>
            {proximo
              ? `Ciclo ${String(proximo.ciclo.numero)} · rodada ${String(proximo.sequencia)} (${nomeDoMes(proximo.mesReferencia)})`
              : 'Nenhum sorteio agendado.'}
          </CardDescription>
        </CardHeader>
        {proximo && (
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>
              Próximo sorteio em{' '}
              <span className="font-medium">{formatarDataHora(proximo.agendadaPara)}</span>.
            </p>
            <Link
              href={`/rodadas/${proximo.id}`}
              className="w-fit font-medium underline underline-offset-4"
            >
              Ver a rodada, declarar que não vai concorrer ou justificar antecipadamente
            </Link>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
