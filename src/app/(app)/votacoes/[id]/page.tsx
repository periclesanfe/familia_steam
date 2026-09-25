import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AtualizarPeriodicamente } from '@/components/AtualizarPeriodicamente'
import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { FormAcao } from '@/components/FormAcao'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { nomeDoAssunto } from '@/domain/ata'
import { cancelarVotacaoAcao } from '@/features/votacoes/acoes'
import { BotoesDeVoto } from '@/features/votacoes/componentes/BotoesDeVoto'
import { PlacarVotacao } from '@/features/votacoes/componentes/PlacarVotacao'
import { detalheVotacao } from '@/features/votacoes/consultas'
import { formatarDataHora } from '@/lib/formato'
import { STATUS_VOTACAO } from '@/lib/rotulos'
import { paginaExige } from '@/server/auth/guardas'
import { agora } from '@/server/relogio'

export const metadata: Metadata = { title: 'Votação' }

// 07 §3.7: proposição, efeito, placar ao vivo com nomes, quórum e voto com confirmação.
export default async function VotacaoPage({ params }: PageProps<'/votacoes/[id]'>) {
  const { pessoaId } = await paginaExige(['MEMBRO'])
  const { id } = await params
  const v = await detalheVotacao(id, pessoaId, agora())
  if (!v) notFound()

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
      {v.status === 'ABERTA' && <AtualizarPeriodicamente />}
      <CabecalhoPagina
        titulo={nomeDoAssunto(v.assunto)}
        descricao={`Convocada por ${v.convocante} em ${formatarDataHora(v.abertaEm)} · versão ${v.versao} do Regulamento`}
        acoes={<StatusBadge {...STATUS_VOTACAO[v.status]} />}
      />
      <Card>
        <CardHeader>
          <CardTitle>{v.proposicao}</CardTitle>
          <CardDescription>Votar a favor significa aprovar isto.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            <span className="font-medium">Efeito:</span> {v.efeitoDescricao}
          </p>
          <p className="whitespace-pre-line">
            <span className="font-medium">Justificativa:</span> {v.justificativa}
          </p>
          {v.efeitoNaoAplicavel && <p className="text-warning">Efeito {v.efeitoNaoAplicavel}.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Placar</CardTitle>
          <CardDescription>
            {v.n} eleitores · quórum de {v.quorum} votos a favor
            {v.status === 'ABERTA' &&
              ` · faltam ${String(v.faltamFavor)} a favor · encerra até ${formatarDataHora(v.encerraEm)}`}
            {v.impedidos.length > 0 && ` · impedido(s): ${v.impedidos.join(', ')}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PlacarVotacao votos={v.votos} pendentes={v.pendentes} n={v.n} quorum={v.quorum} />
          {v.possoVotar && <BotoesDeVoto votacaoId={v.id} />}
          {v.votos.some((x) => x.eu) && (
            <p className="text-sm text-muted-foreground">Seu voto está registrado.</p>
          )}
          {v.podeCancelar && (
            <FormAcao acao={cancelarVotacaoAcao} sucesso="Votação cancelada">
              <input type="hidden" name="votacaoId" value={v.id} />
              <Button type="submit" variant="ghost">
                Cancelar votação
              </Button>
            </FormAcao>
          )}
          {v.aguardandoMaterializacao && (
            <p className="text-sm text-muted-foreground">
              Resultado decidido; a ATA é gerada no próximo processamento automático.
            </p>
          )}
          {v.ata !== null && (
            <Link
              href={`/atas/${String(v.ata)}`}
              className="w-fit text-sm font-medium underline underline-offset-4"
            >
              Ver a ATA nº {v.ata}
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
