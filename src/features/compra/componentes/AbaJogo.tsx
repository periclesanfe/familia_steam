import { CircleAlert, CircleCheck, CircleHelp, TriangleAlert } from 'lucide-react'
import Link from 'next/link'

import { ConfirmarAcao } from '@/components/ConfirmarAcao'
import { Dinheiro } from '@/components/Dinheiro'
import { FormAcao } from '@/components/FormAcao'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import type { Validacao } from '@/domain/compra'
import {
  concluirAquisicaoAcao,
  declararPosseAcao,
  transferirComoSobraAcao,
} from '@/features/compra/acoes'
import type { jogoDaRodada } from '@/features/compra/consultas'
import { convocarAcao } from '@/features/votacoes/acoes'
import { formatarDataHora } from '@/lib/formato'
import { IRREGULARIDADE, STATUS_AVISO, VERIFICACAO } from '@/lib/rotulos'

import { FormAviso, FormCompra, FormReembolso } from './Formularios'

type Dados = Awaited<ReturnType<typeof jogoDaRodada>>

const ICONES = {
  OK: CircleCheck,
  ALERTA: TriangleAlert,
  BLOQUEIO: CircleAlert,
  DESCONHECIDO: CircleHelp,
}
const COR = {
  OK: 'text-success',
  ALERTA: 'text-warning',
  BLOQUEIO: 'text-destructive',
  DESCONHECIDO: 'text-muted-foreground',
}

function Validacoes({ itens }: { itens: Validacao[] }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {itens.map((v) => {
        const Icone = ICONES[v.resultado]
        return (
          <li key={v.regra} className="flex items-start gap-2">
            <Icone className={`mt-0.5 size-4 shrink-0 ${COR[v.resultado]}`} aria-hidden />
            <span>
              <span className="sr-only">{v.resultado}: </span>
              {v.mensagem}{' '}
              <span className="text-xs text-muted-foreground">
                ({v.regra}, {v.artigo})
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// 07 §3.4, aba Jogo: aviso vigente e histórico, veto, 16 IV, compra, reembolso e resumo.
export function AbaJogo({ d, agora }: { d: Dados; agora: Date }) {
  const vigente = d.avisos.find((a) => a.status !== 'SUBSTITUIDO')
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        PRÊMIO <Dinheiro centavos={d.resumo.premioCentavos} className="font-medium" /> · gasto{' '}
        <Dinheiro centavos={d.resumo.gastoCentavos} className="font-medium" /> · SOBRA{' '}
        <Dinheiro centavos={d.resumo.sobraCentavos} className="font-medium" />
        {d.resumo.complementacaoCentavos > 0 && (
          <>
            {' '}
            · complementação do contemplado <Dinheiro centavos={d.resumo.complementacaoCentavos} />
          </>
        )}
        {d.rodada.prazoCompraAte && (
          <>
            {' '}
            · compra até {formatarDataHora(new Date(d.rodada.prazoCompraAte.getTime() - 60_000))}
          </>
        )}
      </p>
      {d.prazoVencido && (
        <p className="text-sm text-warning">
          Prazo de compra vencido sem aquisição (art. 20). Cabe caso omisso para converter o prêmio
          em SOBRA.
        </p>
      )}

      {d.avisos.map((a) => (
        <Card key={a.id} className={a.status === 'SUBSTITUIDO' ? 'opacity-70' : undefined}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Link
                href={`/jogos/${String(a.appId)}`}
                className="underline-offset-4 hover:underline"
              >
                {a.nome}
              </Link>
              <StatusBadge {...(STATUS_AVISO[a.status] ?? { rotulo: a.status, tom: 'neutro' })} />
            </CardTitle>
            <CardDescription>
              Avisado em {formatarDataHora(a.avisadoEm)} · janela de veto até{' '}
              {formatarDataHora(a.janelaVetoAte)}
              {a.autorizadoEm && ` · autorizado em ${formatarDataHora(a.autorizadoEm)}`}
              {a.declarantes > 0 && ` · ${String(a.declarantes)} membro(s) declararam ter o jogo`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Validacoes itens={a.validacoes} />
            {a.id === vigente?.id && (
              <div className="flex flex-wrap gap-2">
                {!d.souContemplado &&
                  ['JANELA_VETO', 'EM_VOTACAO_VETO', 'AGUARDANDO_16IV'].includes(a.status) && (
                    <FormAcao acao={declararPosseAcao} sucesso="Declaração registrada">
                      <input type="hidden" name="avisoId" value={a.id} />
                      {a.euDeclarei && <input type="hidden" name="retirar" value="on" />}
                      <Button type="submit" variant="outline">
                        {a.euDeclarei ? 'Retirar "eu tenho"' : 'Eu tenho este jogo'}
                      </Button>
                    </FormAcao>
                  )}
                {a.exige16IV && !a.tem16IV && (
                  <FormAcao acao={convocarAcao} id={`form-16iv-${a.id}`}>
                    <input type="hidden" name="assunto" value="JOGO_DE_OUTRO_MEMBRO" />
                    <input type="hidden" name="efeito.avisoId" value={a.id} />
                    <input
                      type="hidden"
                      name="proposicao"
                      value={`Autorizar a compra de ${a.nome}, que outro membro já tem`}
                    />
                    <input
                      type="hidden"
                      name="justificativa"
                      value="Exigência do art. 16, IV para jogo que outro membro possui."
                    />
                    <ConfirmarAcao
                      formId={`form-16iv-${a.id}`}
                      rotulo="Convocar autorização (art. 16, IV)"
                      titulo="Convocar a votação de autorização?"
                      consequencias={['Sem a aprovação, a compra deste jogo não fica autorizada.']}
                      artigo="Art. 16, IV"
                    />
                  </FormAcao>
                )}
              </div>
            )}
            {a.id === vigente?.id && !a.temVeto && agora < a.janelaVetoAte && (
              <details className="rounded-md border px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium">
                  Convocar veto (art. 23)
                </summary>
                <FormAcao
                  acao={convocarAcao}
                  id={`form-veto-${a.id}`}
                  className="mt-3 flex flex-col gap-2"
                >
                  <input type="hidden" name="assunto" value="VETO_JOGO" />
                  <input type="hidden" name="efeito.avisoId" value={a.id} />
                  <input
                    type="hidden"
                    name="proposicao"
                    value={`Vetar ${a.nome} e incluí-lo no Anexo I`}
                  />
                  <label htmlFor={`justificativa-${a.id}`} className="text-sm">
                    Motivo do veto (vira o motivo no Anexo I)
                  </label>
                  <Textarea
                    id={`justificativa-${a.id}`}
                    name="justificativa"
                    required
                    minLength={10}
                    rows={2}
                  />
                  <ConfirmarAcao
                    formId={`form-veto-${a.id}`}
                    rotulo="Convocar veto"
                    titulo="Convocar o veto deste jogo?"
                    consequencias={[
                      'Com o veto aberto, a compra não está autorizada.',
                      'A votação de veto não pode ser cancelada.',
                      'Aprovado, o jogo entra no Anexo I e é preciso novo aviso.',
                    ]}
                    artigo="Art. 23"
                  />
                </FormAcao>
              </details>
            )}
          </CardContent>
        </Card>
      ))}

      {d.pode.avisar && (
        <Card>
          <CardHeader>
            <CardTitle>{vigente ? 'Avisar outro jogo' : 'Avisar o jogo escolhido'}</CardTitle>
            <CardDescription>
              A compra só fica autorizada depois da janela de veto (art. 22 e 23).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormAviso rodadaId={d.rodada.id} />
          </CardContent>
        </Card>
      )}

      {d.aquisicoes.length > 0 && (
        <section aria-labelledby="aquisicoes" className="flex flex-col gap-2">
          <h2 id="aquisicoes" className="text-lg font-semibold">
            Aquisições
          </h2>
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {d.aquisicoes.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 px-3 py-2">
                <span>
                  <span className="font-medium">{a.nome}</span> ·{' '}
                  <Dinheiro centavos={a.valorCentavos} /> em {formatarDataHora(a.compradaEm)} ·{' '}
                  <a
                    href={`/api/anexos/${a.comprovanteId}`}
                    target="_blank"
                    rel="noopener"
                    className="underline underline-offset-4"
                  >
                    comprovante
                  </a>{' '}
                  · {VERIFICACAO[a.verificacaoBiblioteca]}
                  {a.reembolsoValorCentavos !== null && (
                    <>
                      {' '}
                      · reembolsado <Dinheiro centavos={a.reembolsoValorCentavos} />
                    </>
                  )}
                </span>
                {a.irregularidades.length > 0 && (
                  <span className="text-warning">
                    Irregular: {a.irregularidades.map((i) => IRREGULARIDADE[i] ?? i).join(', ')}
                    {a.regularizadaAtaNumero !== null &&
                      ` (regularizada pela ATA nº ${String(a.regularizadaAtaNumero)})`}
                  </span>
                )}
                {d.pode.reembolsar && a.reembolsoValorCentavos === null && (
                  <details>
                    <summary className="cursor-pointer text-sm">Registrar reembolso</summary>
                    <div className="mt-2">
                      <FormReembolso aquisicaoId={a.id} />
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.pode.comprar && (
        <details className="rounded-md border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">Registrar compra</summary>
          <div className="mt-3">
            <FormCompra
              rodadaId={d.rodada.id}
              avisoId={vigente?.id}
              steamContemplado={d.rodada.steamContemplado}
            />
          </div>
        </details>
      )}

      <div className="flex flex-wrap gap-2">
        {d.pode.concluir && (
          <FormAcao acao={concluirAquisicaoAcao} id="form-concluir" sucesso="Aquisição concluída">
            <input type="hidden" name="rodadaId" value={d.rodada.id} />
            <ConfirmarAcao
              formId="form-concluir"
              rotulo="Aquisição concluída"
              titulo="Encerrar a aquisição desta rodada?"
              consequencias={[
                'A rodada fecha com o gasto registrado; a diferença vira SOBRA para o próximo contemplado.',
                'Se a rodada anterior ainda não fechou, esta fecha logo depois dela.',
              ]}
              artigo="Arts. 24 e 25"
            />
          </FormAcao>
        )}
        {d.pode.transferir && (
          <FormAcao
            acao={transferirComoSobraAcao}
            id="form-transferir"
            sucesso="Transferido como SOBRA"
          >
            <input type="hidden" name="rodadaId" value={d.rodada.id} />
            <ConfirmarAcao
              formId="form-transferir"
              rotulo="Transferir como SOBRA"
              titulo="Transferir o restante do prêmio como SOBRA?"
              consequencias={['A rodada fecha agora; não haverá nova compra.']}
              artigo="Art. 26"
            />
          </FormAcao>
        )}
      </div>
    </div>
  )
}
