import Link from 'next/link'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import { CopiarTexto } from '@/components/CopiarTexto'
import { FormAcao } from '@/components/FormAcao'
import { PessoaAvatar } from '@/components/PessoaAvatar'
import { StatusBadge } from '@/components/StatusBadge'
import { responderIndicacaoAcao } from '@/features/familias/acoes'
import type { indicacoesDaFamilia } from '@/features/familias/consultas'
import { formatarDataHora } from '@/lib/formato'

type Indicacao = Awaited<ReturnType<typeof indicacoesDaFamilia>>[number]

/** Texto do convite para colar no e-mail ou no GRUPO (RN-FAM-06). */
const mailto = (i: Indicacao, link: string, familia: string) =>
  `mailto:${i.email ?? ''}?subject=${encodeURIComponent(`Convite para a família ${familia}`)}&body=${encodeURIComponent(`Você foi aprovado para entrar na família ${familia}. Entre com a sua conta Steam por este link (só funciona com a sua conta): ${link}`)}`

// RN-FAM-04/05/06: indicações, aprovação unânime antes da vigência e o link de convite.
export function ListaIndicacoes({
  indicacoes,
  appUrl,
  familia,
}: {
  indicacoes: Indicacao[]
  appUrl: string
  familia: string
}) {
  if (indicacoes.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma indicação em andamento.</p>
  }
  return (
    <ul className="flex flex-col divide-y rounded-lg border text-sm">
      {indicacoes.map((i) => {
        const link = i.convite ? `${appUrl}/convite/${i.convite.token}` : null
        return (
          <li key={i.id} className="flex flex-col gap-3 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <PessoaAvatar apelido={i.candidato.nome} url={i.candidato.avatarUrl} />
                <span>
                  <span className="font-medium">{i.candidato.nome}</span>
                  <span className="text-muted-foreground"> · indicado por {i.indicadaPor}</span>
                </span>
              </span>
              {i.status === 'APROVADA' ? (
                <StatusBadge rotulo="Aprovado: convite enviado" tom="sucesso" />
              ) : (
                <StatusBadge rotulo="Aguardando decisão" tom="atencao" />
              )}
            </div>
            <p className="text-muted-foreground">
              {i.candidato.bibliotecaPublica === false
                ? 'Biblioteca privada na Steam: não dá para ver os jogos.'
                : `${String(i.candidato.jogos)} jogos · acrescenta ${String(i.candidato.novos)} que a família não tem (${String(i.candidato.novosCompartilhaveis)} compartilháveis confirmados)`}
              {i.candidato.perfilUrl && (
                <>
                  {' · '}
                  <a
                    href={i.candidato.perfilUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    perfil na Steam
                  </a>
                </>
              )}
            </p>
            {i.status === 'ABERTA' && i.votacaoId && (
              <Link
                href={`/votacoes/${i.votacaoId}`}
                className="w-fit font-medium underline underline-offset-4"
              >
                Votar a admissão
              </Link>
            )}
            {i.status === 'ABERTA' && !i.votacaoId && (
              <div className="flex flex-wrap items-center gap-2">
                {i.aprovacoes.map((a) => (
                  <StatusBadge
                    key={a.nome}
                    rotulo={`${a.nome}: ${a.resposta === null ? 'pendente' : a.resposta ? 'aprova' : 'recusa'}`}
                    tom={a.resposta === null ? 'neutro' : a.resposta ? 'sucesso' : 'perigo'}
                  />
                ))}
                {i.minhaResposta === null && (
                  <>
                    <FormAcao acao={responderIndicacaoAcao} sucesso="Aprovação registrada">
                      <input type="hidden" name="indicacaoId" value={i.id} />
                      <input type="hidden" name="resposta" value="aprovo" />
                      <BotaoEnviar size="sm">Aprovo</BotaoEnviar>
                    </FormAcao>
                    <FormAcao acao={responderIndicacaoAcao} sucesso="Recusa registrada">
                      <input type="hidden" name="indicacaoId" value={i.id} />
                      <input type="hidden" name="resposta" value="recuso" />
                      <BotaoEnviar size="sm" variant="outline">
                        Recuso
                      </BotaoEnviar>
                    </FormAcao>
                  </>
                )}
                <span className="text-xs text-muted-foreground">
                  decide até {formatarDataHora(i.expiraEm)}
                </span>
              </div>
            )}
            {link && i.convite && (
              <div className="flex flex-wrap items-center gap-2">
                <CopiarTexto texto={link} rotulo="Copiar link" />
                <a
                  href={mailto(i, link, familia)}
                  className="font-medium underline underline-offset-4"
                >
                  Enviar por e-mail
                </a>
                <span className="text-xs text-muted-foreground">
                  vale até {formatarDataHora(i.convite.expiraEm)}
                </span>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
