import Link from 'next/link'

import { Dinheiro } from '@/components/Dinheiro'
import { FormAcao } from '@/components/FormAcao'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  cancelarPagamentoAcao,
  confirmarPagamentoAcao,
  contestarPagamentoAcao,
  retirarContestacaoAcao,
} from '@/features/financeiro/acoes'
import type { ObrigacaoDTO } from '@/features/financeiro/consultas'
import { formatarDataHora } from '@/lib/formato'
import { MOTIVO_CONTESTACAO, SITUACAO, STATUS_PAGAMENTO, TIPO_OBRIGACAO } from '@/lib/rotulos'

import { FormJustificarObrigacao } from './FormJustificarObrigacao'
import { FormPagar } from './FormPagar'

const venceAte = (t: Date) => formatarDataHora(new Date(t.getTime() - 60_000)) // "fim do dia" = 23:59

// 07 §3.4, aba Pagamentos (e /financeiro): uma linha por obrigação; ações conforme o papel.
export function ListaObrigacoes({
  obrigacoes,
  eu,
  agora,
  mostrarRodada = false,
}: {
  obrigacoes: ObrigacaoDTO[]
  eu: string
  agora: Date
  mostrarRodada?: boolean
}) {
  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {obrigacoes.map((o) => {
        const souDevedor = o.devedorId === eu
        const aberta =
          o.saldoCentavos > 0 && o.situacao !== 'CANCELADA' && o.situacao !== 'AUTOQUITADA'
        return (
          <li key={o.id} className="flex flex-col gap-3 px-4 py-3 text-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">
                  {o.devedor} → {o.credor}
                  {o.tipo !== 'CONTRIBUICAO' && (
                    <span className="text-muted-foreground"> · {TIPO_OBRIGACAO[o.tipo]}</span>
                  )}
                </span>
                <span className="text-muted-foreground">
                  <Dinheiro centavos={o.valorCentavos} />
                  {o.situacao !== 'AUTOQUITADA' && (
                    <> · vence até {venceAte(o.vencimentoEfetivo)}</>
                  )}
                  {o.prorrogada && ' (prorrogada)'}
                  {aberta && o.saldoCentavos !== o.valorCentavos && (
                    <>
                      {' '}
                      · falta <Dinheiro centavos={o.saldoCentavos} />
                    </>
                  )}
                </span>
                {mostrarRodada && (
                  <Link
                    href={`/rodadas/${o.rodada.id}?aba=pagamentos`}
                    className="w-fit text-xs underline underline-offset-4"
                  >
                    Ciclo {o.rodada.ciclo}, rodada {o.rodada.sequencia}
                  </Link>
                )}
                {o.justificativa && (
                  <span className="text-xs text-muted-foreground">
                    Justificativa: “{o.justificativa}”
                  </span>
                )}
              </div>
              <StatusBadge {...SITUACAO[o.situacao]} />
            </div>

            {o.pagamentos.length > 0 && (
              <ul className="flex flex-col gap-2 border-l-2 pl-3">
                {o.pagamentos.map((p) => {
                  const souRecebedor = p.recebedorId === eu
                  return (
                    <li
                      key={p.id}
                      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span>
                        <Dinheiro centavos={p.valorCentavos} /> · Pix em {formatarDataHora(p.pixEm)}
                        {p.formaDiversa && ' · forma diversa'}
                        {p.comprovanteId && (
                          <>
                            {' · '}
                            <a
                              href={`/api/anexos/${p.comprovanteId}`}
                              target="_blank"
                              rel="noopener"
                              className="underline underline-offset-4"
                            >
                              comprovante
                            </a>
                          </>
                        )}
                        {p.registradoEm > o.vencimentoEfetivo && p.pixEm < o.vencimentoEfetivo && (
                          <span className="text-muted-foreground"> · registrado após o prazo</span>
                        )}
                        {p.motivoContestacao && (
                          <span className="text-muted-foreground">
                            {' '}
                            · {MOTIVO_CONTESTACAO[p.motivoContestacao]}
                          </span>
                        )}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusBadge {...STATUS_PAGAMENTO[p.status]} />
                        {souRecebedor && p.status === 'DECLARADO' && (
                          <>
                            <FormAcao acao={confirmarPagamentoAcao} sucesso="Pagamento confirmado">
                              <input type="hidden" name="pagamentoId" value={p.id} />
                              <Button type="submit" size="sm">
                                Confirmar
                              </Button>
                            </FormAcao>
                            <FormAcao
                              acao={contestarPagamentoAcao}
                              className="flex items-center gap-1"
                              sucesso="Pagamento contestado"
                            >
                              <input type="hidden" name="pagamentoId" value={p.id} />
                              <NativeSelect
                                name="motivo"
                                size="sm"
                                aria-label="Motivo da contestação"
                                required
                              >
                                {Object.entries(MOTIVO_CONTESTACAO).map(([k, r]) => (
                                  <NativeSelectOption key={k} value={k}>
                                    {r}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                              <Button type="submit" size="sm" variant="outline">
                                Contestar
                              </Button>
                            </FormAcao>
                          </>
                        )}
                        {souRecebedor && p.status === 'CONTESTADO' && (
                          <FormAcao acao={retirarContestacaoAcao} sucesso="Contestação retirada">
                            <input type="hidden" name="pagamentoId" value={p.id} />
                            <Button type="submit" size="sm" variant="outline">
                              Retirar contestação
                            </Button>
                          </FormAcao>
                        )}
                        {souDevedor && (p.status === 'DECLARADO' || p.status === 'CONTESTADO') && (
                          <FormAcao acao={cancelarPagamentoAcao} sucesso="Pagamento cancelado">
                            <input type="hidden" name="pagamentoId" value={p.id} />
                            <Button type="submit" size="sm" variant="destructive">
                              Cancelar
                            </Button>
                          </FormAcao>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}

            {aberta && (
              <details className="group rounded-md border px-3 py-2 open:pb-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {souDevedor ? 'Paguei' : 'Registrar pagamento'}
                  {o.chavePixCredor && souDevedor && (
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · Pix de {o.credor}: <span className="font-mono">{o.chavePixCredor}</span>
                    </span>
                  )}
                </summary>
                {o.chavePixAlteradaEm &&
                  o.chavePixAlteradaEm > new Date(agora.getTime() - 30 * 86_400_000) && (
                    <p className="mt-2 text-xs text-warning">
                      Chave Pix alterada em {formatarDataHora(o.chavePixAlteradaEm)} (RN-CAD-05).
                    </p>
                  )}
                <div className="mt-3 flex flex-col gap-4">
                  <FormPagar obrigacaoId={o.id} saldoCentavos={o.saldoCentavos} />
                  {souDevedor && !o.justificativa && agora < o.vencimentoEfetivo && (
                    <FormJustificarObrigacao obrigacaoId={o.id} />
                  )}
                </div>
              </details>
            )}
          </li>
        )
      })}
    </ul>
  )
}
