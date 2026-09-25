import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { FormAcao } from '@/components/FormAcao'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { dataLocal } from '@/domain/tempo'
import { aceitarConviteAcao } from '@/features/familias/acoes'
import { formatarDataHora } from '@/lib/formato'
import { perfilDe } from '@/server/auth/perfil'
import { obterSessao } from '@/server/auth/sessao'
import { dbBase } from '@/server/db'
import { agora } from '@/server/relogio'

export const metadata: Metadata = { title: 'Convite' }

// RN-FAM-06: o link só serve à conta Steam convidada; qualquer outra vê "convite inválido".
export default async function ConvitePage({ params }: PageProps<'/convite/[token]'>) {
  const sessao = await obterSessao()
  if (!sessao) redirect('/entrar')
  const { token } = await params
  const t = agora()
  const [convite, pessoa, perfil] = await Promise.all([
    dbBase.convite.findUnique({ where: { token } }),
    dbBase.pessoa.findUniqueOrThrow({
      where: { id: sessao.pessoaId },
      select: { steamId64: true },
    }),
    perfilDe(sessao.pessoaId),
  ])
  const valido = convite?.steamId64 === pessoa.steamId64 && !convite.usadoEm && t < convite.expiraEm
  const familia = valido
    ? await dbBase.familia.findUnique({
        where: { id: convite.familiaId },
        select: { nome: true },
      })
    : null

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-12">
      <CabecalhoPagina titulo="Convite" />
      {!convite || !familia ? (
        <p className="text-sm text-muted-foreground">
          Convite inválido para esta conta Steam, já usado ou vencido.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Entrar na família {familia.nome}</CardTitle>
            <CardDescription>
              Os membros aprovaram a sua entrada. Vale até {formatarDataHora(convite.expiraEm)}.
              Depois você assina o Regulamento do consórcio da família.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {perfil?.perfil === 'MEMBRO' || perfil?.perfil === 'PENDENTE' ? (
              <p className="text-sm text-warning">
                Você já está numa família. Saia dela antes de aceitar (uma família por vez).
              </p>
            ) : (
              <FormAcao acao={aceitarConviteAcao} className="flex flex-col gap-3">
                <input type="hidden" name="token" value={token} />
                <Field orientation="horizontal">
                  <Checkbox id="jaNaFamilia" name="jaNaFamilia" />
                  <FieldLabel htmlFor="jaNaFamilia" className="font-normal">
                    Já estou na Família Steam deles
                  </FieldLabel>
                </Field>
                <Field>
                  <FieldLabel htmlFor="naFamiliaSteamDesde">Desde</FieldLabel>
                  <Input
                    id="naFamiliaSteamDesde"
                    name="naFamiliaSteamDesde"
                    type="date"
                    max={dataLocal(t)}
                  />
                </Field>
                <div>
                  <BotaoEnviar>Aceitar convite</BotaoEnviar>
                </div>
              </FormAcao>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
