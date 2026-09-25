import type { Metadata } from 'next'
import Link from 'next/link'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { FormAcao } from '@/components/FormAcao'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { dataLocal } from '@/domain/tempo'
import { registrarExecucaoAcao } from '@/features/familia/acoes'
import { ListaIndicacoes } from '@/features/familias/componentes/ListaIndicacoes'
import { familiaDe, indicacoesDaFamilia } from '@/features/familias/consultas'
import { GradeBiblioteca } from '@/features/steam/componentes/GradeBiblioteca'
import { bibliotecaDaFamilia, familia } from '@/features/steam/consultas'
import { formatarDataCivil } from '@/lib/formato'
import { paginaExige } from '@/server/auth/guardas'
import { env } from '@/server/env'
import { agora } from '@/server/relogio'

export const metadata: Metadata = { title: 'Família' }

// 07 §3.10: integrantes, vagas, biblioteca compartilhável (RN-STM-12) e regras da Steam (RN-STM-13).
export default async function FamiliaPage() {
  const { pessoaId } = await paginaExige(['MEMBRO'])
  const t = agora()
  const [f, biblioteca, indicacoes, nomeFamilia] = await Promise.all([
    familia(t),
    bibliotecaDaFamilia(),
    indicacoesDaFamilia(pessoaId, t),
    familiaDe(pessoaId),
  ])

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo="Família Steam"
        descricao="Quem está na família e o que dá para compartilhar."
        acoes={
          <nav aria-label="Atalhos" className="flex gap-3 text-sm">
            <Link href="/membros" className="underline underline-offset-4">
              Membros
            </Link>
            <Link href="/lista-de-desejos" className="underline underline-offset-4">
              Minha lista de desejos
            </Link>
          </nav>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Indicações e convites</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Link href="/inicio" className="w-fit text-sm font-medium underline underline-offset-4">
            Indicar um amigo Steam
          </Link>
          <ListaIndicacoes
            indicacoes={indicacoes}
            appUrl={env().APP_URL}
            familia={nomeFamilia ?? 'Família'}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Integrantes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y text-sm">
              {f.integrantes.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {i.membro ? (
                      <Link
                        href={`/membros/${i.pessoaId}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {i.apelido}
                      </Link>
                    ) : (
                      <span className="font-medium">{i.apelido}</span>
                    )}
                    <span className="text-muted-foreground">
                      {' '}
                      · {i.membro ? 'membro' : 'integrante'}
                      {i.entrouEm && ` · desde ${formatarDataCivil(i.entrouEm)}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {i.status.toLowerCase().replaceAll('_', ' ')}
                    {(i.status === 'CONVITE_AUTORIZADO' || i.status === 'REMOCAO_AUTORIZADA') && (
                      <FormAcao
                        acao={registrarExecucaoAcao}
                        sucesso="Execução registrada"
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="integranteId" value={i.id} />
                        <label className="sr-only" htmlFor={`executadaEm-${i.id}`}>
                          Data em que foi feito na Steam
                        </label>
                        <Input
                          id={`executadaEm-${i.id}`}
                          name="executadaEm"
                          type="date"
                          required
                          max={dataLocal(t)}
                          className="h-8 w-36"
                        />
                        <BotaoEnviar size="sm" variant="outline">
                          {i.status === 'CONVITE_AUTORIZADO' ? 'Convite feito' : 'Remoção feita'}
                        </BotaoEnviar>
                      </FormAcao>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Vagas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>
              Capacidade <span className="font-medium tabular-nums">{f.vagas.capacidade}</span> ·
              ocupadas <span className="font-medium tabular-nums">{f.vagas.ocupadas}</span> · livres{' '}
              <span className="font-medium tabular-nums">{Math.max(0, f.vagas.livres)}</span>
            </p>
            {f.vagas.bloqueadas.map((b) => (
              <p key={b.apelido} className="text-muted-foreground">
                Vaga de {b.apelido} bloqueada até {formatarDataCivil(b.ate)} (cooldown da Steam,
                art. 35).
              </p>
            ))}
            <ul className="ml-4 list-disc text-xs text-muted-foreground">
              <li>Até 6 contas por família; 1 jogador por cópia ao mesmo tempo.</li>
              <li>O dono não tem prioridade sobre a cópia em uso.</li>
              <li>F2P e jogos que exigem conta de terceiros não são compartilháveis.</li>
              <li>
                Trapaça pode tirar os privilégios de família do dono; quem sai espera 1 ano para
                outra família.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="biblioteca" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="biblioteca" className="text-lg font-semibold">
            Biblioteca da família
          </h2>
          <p className="text-xs text-muted-foreground">
            Aproximação: só os jogos próprios de quem tem a biblioteca pública (a Steam não expõe a
            família nem as DLCs).
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-3">
          {(
            [
              ['Jogos diferentes', biblioteca.length],
              ['Compartilháveis', biblioteca.filter((j) => j.compartilhavel === 'SIM').length],
              ['Horas jogadas', biblioteca.reduce((s, j) => s + j.horas, 0)],
            ] as const
          ).map(([rotulo, valor]) => (
            <div key={rotulo} className="rounded-lg border bg-card p-3">
              <dt className="text-xs text-muted-foreground">{rotulo}</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {valor.toLocaleString('pt-BR')}
              </dd>
            </div>
          ))}
        </dl>
        <GradeBiblioteca jogos={biblioteca} />
      </section>
    </div>
  )
}
