import type { Metadata } from 'next'
import Link from 'next/link'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { FormAcao } from '@/components/FormAcao'
import { StatusBadge } from '@/components/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { dataLocal } from '@/domain/tempo'
import { registrarExecucaoAcao } from '@/features/familia/acoes'
import { bibliotecaDaFamilia, type Compartilhavel, familia } from '@/features/steam/consultas'
import { formatarDataCivil } from '@/lib/formato'
import type { Tom } from '@/lib/rotulos'
import { paginaExige } from '@/server/auth/guardas'
import { agora } from '@/server/relogio'

export const metadata: Metadata = { title: 'Família' }

const COMPARTILHAVEL: Record<Compartilhavel, { rotulo: string; tom: Tom }> = {
  SIM: { rotulo: 'Compartilhável', tom: 'sucesso' },
  NAO: { rotulo: 'Não compartilhável', tom: 'inativo' },
  VERIFICANDO: { rotulo: 'Verificando…', tom: 'neutro' },
}
const FILTROS = [
  ['todos', 'Todos'],
  ['compartilhaveis', 'Compartilháveis'],
  ['verificando', 'Verificando'],
] as const

// 07 §3.10: integrantes, vagas, biblioteca compartilhável (RN-STM-12) e regras da Steam (RN-STM-13).
export default async function FamiliaPage({ searchParams }: PageProps<'/familia'>) {
  await paginaExige(['MEMBRO'])
  const t = agora()
  const [{ filtro, busca }, f, biblioteca] = await Promise.all([
    searchParams,
    familia(t),
    bibliotecaDaFamilia(),
  ])
  const termo = typeof busca === 'string' ? busca.toLocaleLowerCase('pt-BR') : ''
  const jogos = biblioteca.filter(
    (j) =>
      (filtro !== 'compartilhaveis' || j.compartilhavel === 'SIM') &&
      (filtro !== 'verificando' || j.compartilhavel === 'VERIFICANDO') &&
      (!termo || j.nome.toLocaleLowerCase('pt-BR').includes(termo)),
  )

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

      <section aria-labelledby="biblioteca" className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="biblioteca" className="text-lg font-semibold">
            Biblioteca da família{' '}
            <span className="text-sm font-normal text-muted-foreground">({jogos.length})</span>
          </h2>
          <form className="flex gap-2" role="search">
            <input
              name="busca"
              defaultValue={typeof busca === 'string' ? busca : ''}
              placeholder="Buscar jogo"
              aria-label="Buscar jogo"
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            />
            {typeof filtro === 'string' && <input type="hidden" name="filtro" value={filtro} />}
          </form>
        </div>
        <nav aria-label="Filtro" className="flex gap-3 text-sm">
          {FILTROS.map(([id, rotulo]) => (
            <Link
              key={id}
              href={id === 'todos' ? '/familia' : `/familia?filtro=${id}`}
              aria-current={(filtro ?? 'todos') === id ? 'page' : undefined}
              className="underline-offset-4 hover:underline aria-[current=page]:font-semibold"
            >
              {rotulo}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-muted-foreground">
          Aproximação: só os jogos próprios de quem tem a biblioteca pública (a Steam não expõe a
          família nem as DLCs).
        </p>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {jogos.map((j) => (
            <li key={j.appId} className="flex flex-col overflow-hidden rounded-lg border">
              <Link href={`/jogos/${String(j.appId)}`} className="flex flex-col">
                <div className="aspect-[460/215] bg-muted">
                  {j.imagemUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- capa do CDN da Steam, sem otimizador (13 DP-12)
                    <img
                      src={j.imagemUrl}
                      alt=""
                      width={460}
                      height={215}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  )}
                </div>
                <div className="flex flex-col gap-1 p-3 text-sm">
                  <span className="font-medium">{j.nome}</span>
                  <span className="text-muted-foreground">
                    {j.copias} cópia{j.copias > 1 ? 's' : ''}:{' '}
                    {j.donos.map((d) => d.apelido).join(', ')}
                  </span>
                  <StatusBadge {...COMPARTILHAVEL[j.compartilhavel]} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
