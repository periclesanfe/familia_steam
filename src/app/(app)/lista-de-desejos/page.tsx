import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Dinheiro } from '@/components/Dinheiro'
import { FormAcao } from '@/components/FormAcao'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  adicionarDesejoAcao,
  moverDesejoAcao,
  removerDesejoAcao,
  sincronizarAgoraAcao,
} from '@/features/steam/acoes'
import { perfilDoMembro } from '@/features/steam/consultas'
import { paginaExige } from '@/server/auth/guardas'

export const metadata: Metadata = { title: 'Minha lista de desejos' }

// 07 §3.12 / RN-COM-01: itens da Steam (só leitura, na ordem da Steam) + itens manuais.
export default async function ListaDeDesejosPage() {
  const { pessoaId } = await paginaExige(['MEMBRO'])
  const m = await perfilDoMembro(pessoaId)
  const itens = m?.desejos ?? []
  const steam = itens.filter((i) => i.origem === 'STEAM')
  const manuais = itens.filter((i) => i.origem === 'MANUAL')

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo="Minha lista de desejos"
        descricao="A ordem vale como prioridade para o jogo do mês (art. 15)."
        acoes={
          <FormAcao acao={sincronizarAgoraAcao} sucesso="Sincronização concluída">
            <Button type="submit" variant="outline">
              Sincronizar com a Steam
            </Button>
          </FormAcao>
        }
      />
      <section aria-labelledby="steam" className="flex flex-col gap-2">
        <h2 id="steam" className="text-lg font-semibold">
          Da Steam
        </h2>
        {steam.length === 0 ? (
          <p className="text-sm text-muted-foreground">Vazia, privada ou ainda não sincronizada.</p>
        ) : (
          <ol className="flex flex-col divide-y rounded-lg border text-sm">
            {steam.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>
                  <span className="text-muted-foreground tabular-nums">{d.posicao}. </span>
                  <Link
                    href={`/jogos/${String(d.appId)}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {d.nome}
                  </Link>
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
      <section aria-labelledby="manuais" className="flex flex-col gap-3">
        <h2 id="manuais" className="text-lg font-semibold">
          Itens manuais
        </h2>
        <FormAcao acao={adicionarDesejoAcao} sucesso="Item adicionado" className="flex gap-2">
          <Input
            name="texto"
            required
            maxLength={200}
            placeholder="Link da loja Steam, appId ou nome (outra loja)"
            aria-label="Link da loja Steam, appId ou nome"
          />
          <Button type="submit">Adicionar</Button>
        </FormAcao>
        {manuais.length > 0 && (
          <ol className="flex flex-col divide-y rounded-lg border text-sm">
            {manuais.map((d, i) => (
              <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>
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
                  {d.bloqueado && <StatusBadge rotulo="Anexo I" tom="perigo" />}
                </span>
                <span className="flex items-center gap-1">
                  {(['cima', 'baixo'] as const).map((direcao) => (
                    <FormAcao key={direcao} acao={moverDesejoAcao}>
                      <input type="hidden" name="itemId" value={d.id} />
                      <input type="hidden" name="direcao" value={direcao} />
                      <Button
                        type="submit"
                        size="icon-sm"
                        variant="ghost"
                        disabled={direcao === 'cima' ? i === 0 : i === manuais.length - 1}
                      >
                        {direcao === 'cima' ? <ArrowUp /> : <ArrowDown />}
                        <span className="sr-only">Mover para {direcao}</span>
                      </Button>
                    </FormAcao>
                  ))}
                  <FormAcao acao={removerDesejoAcao} sucesso="Item removido">
                    <input type="hidden" name="itemId" value={d.id} />
                    <Button type="submit" size="icon-sm" variant="ghost">
                      <Trash2 />
                      <span className="sr-only">Remover {d.nome}</span>
                    </Button>
                  </FormAcao>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
