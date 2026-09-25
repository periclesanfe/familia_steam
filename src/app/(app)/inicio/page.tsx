import type { Metadata } from 'next'
import Link from 'next/link'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { FormAcao } from '@/components/FormAcao'
import { PessoaAvatar } from '@/components/PessoaAvatar'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { dataLocal } from '@/domain/tempo'
import { criarFamiliaAcao, indicarAcao } from '@/features/familias/acoes'
import { minhaArea } from '@/features/familias/consultas'
import { sincronizarAgoraAcao } from '@/features/steam/acoes'
import { formatarDataCivil, formatarDataHora } from '@/lib/formato'
import { paginaExige, TODOS_OS_PERFIS } from '@/server/auth/guardas'
import { agora } from '@/server/relogio'

export const metadata: Metadata = { title: 'Início' }

// 15 §1: área pessoal de qualquer conta Steam — perfil, família, convites, amigos e listas.
export default async function InicioPage() {
  const { pessoaId, perfil } = await paginaExige(TODOS_OS_PERFIS)
  const t = agora()
  const a = await minhaArea(pessoaId, t)
  const naFamilia = perfil === 'MEMBRO' || perfil === 'PENDENTE'

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PessoaAvatar apelido={a.pessoa.nome} url={a.pessoa.steamAvatarUrl} />
          <CabecalhoPagina
            titulo={`Olá, ${a.pessoa.nome}`}
            descricao={
              a.pessoa.steamSincronizadoEm
                ? `Dados da Steam de ${formatarDataHora(a.pessoa.steamSincronizadoEm)}`
                : 'Seus dados da Steam chegam em instantes.'
            }
          />
        </div>
        <div className="flex gap-2">
          {naFamilia && (
            <Button asChild variant="outline">
              <Link href={perfil === 'MEMBRO' ? '/' : '/boas-vindas'}>Ir para a família</Link>
            </Button>
          )}
          <FormAcao acao={sincronizarAgoraAcao} sucesso="Sincronizado com a Steam">
            <BotaoEnviar variant="outline">Sincronizar Steam</BotaoEnviar>
          </FormAcao>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sua família</CardTitle>
            <CardDescription>
              {a.familia && naFamilia
                ? `Você está na família ${a.familia}.`
                : 'Você ainda não está numa família. Crie uma ou aceite um convite.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            {a.convites.length > 0 && (
              <ul className="flex flex-col divide-y rounded-lg border">
                {a.convites.map((c) => (
                  <li key={c.token} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span>
                      Convite para <span className="font-medium">{c.familia}</span> · vale até{' '}
                      {formatarDataHora(c.expiraEm)}
                    </span>
                    <Button asChild size="sm">
                      <Link href={`/convite/${c.token}`}>Ver convite</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {perfil === 'VISITANTE' && (
              <FormAcao acao={criarFamiliaAcao} className="flex flex-col gap-3">
                <FieldGroup className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="nome">Nome da família</FieldLabel>
                    <Input id="nome" name="nome" required minLength={3} maxLength={60} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="entrouNaFamiliaEm">Na Família Steam desde</FieldLabel>
                    <Input
                      id="entrouNaFamiliaEm"
                      name="entrouNaFamiliaEm"
                      type="date"
                      required
                      max={dataLocal(t)}
                    />
                  </Field>
                </FieldGroup>
                <div>
                  <BotaoEnviar>Criar família</BotaoEnviar>
                </div>
              </FormAcao>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Seus jogos e desejos</CardTitle>
            <CardDescription>
              {a.pessoa.steamJogosPublicos === false
                ? 'Sua biblioteca na Steam está privada: deixe "Detalhes do jogo" como público.'
                : `${String(a.totalJogos)} jogos na biblioteca.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {a.desejos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Lista de desejos vazia ou privada.</p>
            ) : (
              <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {a.desejos.map((d) => (
                  <li key={d.id} className="flex flex-col gap-1 text-xs">
                    {d.imagemUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- CDN da Steam, sem otimização (08 §8.2)
                      <img
                        src={d.imagemUrl}
                        alt=""
                        className="aspect-[460/215] w-full rounded object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="aspect-[460/215] w-full rounded bg-muted" />
                    )}
                    <span className="line-clamp-2">{d.nome}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Amigos Steam</CardTitle>
          <CardDescription>
            {naFamilia
              ? 'Indique um amigo: todos da família aprovam antes do convite ser enviado.'
              : 'Sua lista de amigos (precisa estar pública na Steam).'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {a.amigos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum amigo encontrado. Deixe a lista de amigos pública e sincronize.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {a.amigos.map((f) => (
                <li
                  key={f.amigoSteamId64}
                  className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <PessoaAvatar apelido={f.nick ?? '?'} url={f.avatarUrl} />
                    <span className="truncate">{f.nick ?? f.amigoSteamId64}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {f.naMinhaFamilia ? (
                      <StatusBadge rotulo="Na família" tom="sucesso" />
                    ) : f.noSistema ? (
                      <StatusBadge rotulo="No sistema" tom="neutro" />
                    ) : null}
                    {naFamilia && !f.naMinhaFamilia && (
                      <FormAcao acao={indicarAcao} sucesso="Indicação enviada para aprovação">
                        <input type="hidden" name="conta" value={f.amigoSteamId64} />
                        <BotaoEnviar size="sm" variant="outline">
                          Indicar
                        </BotaoEnviar>
                      </FormAcao>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {naFamilia && (
            <FormAcao
              acao={indicarAcao}
              sucesso="Indicação enviada para aprovação"
              className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
            >
              <Field>
                <FieldLabel htmlFor="conta">Ou cole o link do perfil Steam</FieldLabel>
                <Input
                  id="conta"
                  name="conta"
                  required
                  placeholder="https://steamcommunity.com/id/…"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">E-mail (opcional)</FieldLabel>
                <Input id="email" name="email" type="email" />
              </Field>
              <BotaoEnviar variant="outline">Indicar</BotaoEnviar>
            </FormAcao>
          )}
        </CardContent>
      </Card>
      {a.pessoa.steamSincronizadoEm === null && (
        <p className="text-xs text-muted-foreground">
          Primeiro acesso em {formatarDataCivil(dataLocal(t))}: se os dados não aparecerem, use
          &quot;Sincronizar Steam&quot;.
        </p>
      )}
    </div>
  )
}
