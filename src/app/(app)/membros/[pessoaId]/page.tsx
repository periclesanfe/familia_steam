import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Dinheiro } from '@/components/Dinheiro'
import { FormAcao } from '@/components/FormAcao'
import { PessoaAvatar } from '@/components/PessoaAvatar'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { sincronizarAgoraAcao } from '@/features/steam/acoes'
import { perfilDoMembro } from '@/features/steam/consultas'
import { formatarDataHora } from '@/lib/formato'
import { paginaExige } from '@/server/auth/guardas'

export const metadata: Metadata = { title: 'Membro' }

const sim = (v: boolean | null) => (v === null ? '—' : v ? 'público' : 'privado')

// 07 §3.11: avatar, nick, código de amigo, jogos e lista de desejos; guia de privacidade (06 §7).
export default async function MembroPage({ params }: PageProps<'/membros/[pessoaId]'>) {
  const eu = await paginaExige(['MEMBRO'])
  const { pessoaId } = await params
  const m = await perfilDoMembro(pessoaId)
  if (!m) notFound()
  const p = m.pessoa
  const privado = p.steamJogosPublicos === false

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <div className="flex items-center gap-3">
        <PessoaAvatar apelido={p.apelido} url={p.steamAvatarUrl} />
        <CabecalhoPagina
          titulo={p.apelido}
          descricao={
            <>
              {p.steamNick && `${p.steamNick} · `}código de amigo{' '}
              <span className="font-mono">{p.codigoAmigo ?? '—'}</span>
              {p.steamPerfilUrl && (
                <>
                  {' · '}
                  <a
                    href={p.steamPerfilUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    perfil na Steam
                  </a>
                </>
              )}
            </>
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Steam</CardTitle>
          <CardDescription>
            Perfil {sim(p.steamPerfilPublico)} · jogos {sim(p.steamJogosPublicos)} · lista de
            desejos {sim(p.steamDesejosPublicos)} ·{' '}
            {p.steamSincronizadoEm
              ? `sincronizado em ${formatarDataHora(p.steamSincronizadoEm)}`
              : 'nunca sincronizado'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {privado && (
            <p className="text-warning">
              Os detalhes de jogos estão privados. Para a família ver a biblioteca e as checagens do
              jogo do mês funcionarem: Steam → Perfil → Editar perfil → Configurações de privacidade
              → &quot;Detalhes dos jogos: Público&quot;. Sem isso, as verificações pedem declaração
              manual e a verificação pós-compra exige print.
            </p>
          )}
          {eu.pessoaId === p.id && (
            <FormAcao acao={sincronizarAgoraAcao} sucesso="Sincronização concluída">
              <Button type="submit" variant="outline">
                Sincronizar com a Steam
              </Button>
            </FormAcao>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="desejos" className="flex flex-col gap-2">
          <h2 id="desejos" className="text-lg font-semibold">
            Lista de desejos
          </h2>
          {m.desejos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Vazia ou privada.</p>
          ) : (
            <ol className="flex flex-col divide-y rounded-lg border text-sm">
              {m.desejos.map((d, i) => (
                <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span>
                    <span className="text-muted-foreground tabular-nums">{i + 1}. </span>
                    {d.appId ? (
                      <Link
                        href={`/jogos/${String(d.appId)}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {d.nome}
                      </Link>
                    ) : (
                      d.nome
                    )}
                    {d.origem === 'MANUAL' && (
                      <span className="text-xs text-muted-foreground"> (manual)</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    {d.precoCentavos !== null && (
                      <Dinheiro centavos={d.precoCentavos} className="text-muted-foreground" />
                    )}
                    {d.bloqueado && <StatusBadge rotulo="Anexo I" tom="perigo" />}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section aria-labelledby="jogos" className="flex flex-col gap-2">
          <h2 id="jogos" className="text-lg font-semibold">
            Jogos{' '}
            <span className="text-sm font-normal text-muted-foreground">({m.jogos.length})</span>
          </h2>
          <ul className="flex max-h-[32rem] flex-col divide-y overflow-y-auto rounded-lg border text-sm">
            {m.jogos.map((j) => (
              <li key={j.appId} className="flex justify-between gap-2 px-3 py-2">
                <Link
                  href={`/jogos/${String(j.appId)}`}
                  className="underline-offset-4 hover:underline"
                >
                  {j.nome}
                </Link>
                <span className="text-muted-foreground tabular-nums">{j.horas} h</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
