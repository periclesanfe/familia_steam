import type { Metadata } from 'next'
import Link from 'next/link'

import { AbasNaUrl } from '@/components/AbasNaUrl'
import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Markdown } from '@/components/Markdown'
import { dividirRegulamento } from '@/domain/regulamento'
import { AnexosDoRegulamento } from '@/features/regulamento/componentes/AnexosDoRegulamento'
import { anexoI, versaoAplicavel } from '@/features/regulamento/consultas'
import { formatarDataHora } from '@/lib/formato'
import { paginaExige } from '@/server/auth/guardas'
import { agora } from '@/server/relogio'

export const metadata: Metadata = { title: 'Regulamento' }

// 07 §3.13: versão vigente com âncoras por artigo, Anexo I e versões.
export default async function RegulamentoPage({ searchParams }: PageProps<'/regulamento'>) {
  await paginaExige(['MEMBRO', 'EX_COM_PENDENCIA', 'EX_QUITADO'])
  const [versao, bloqueados, { aba: abaPedida }] = await Promise.all([
    versaoAplicavel(agora()),
    anexoI(),
    searchParams,
  ])
  if (!versao) return <p className="text-sm text-muted-foreground">Nenhuma versão carregada.</p>
  const { corpo, anexos } = dividirRegulamento(versao.textoMarkdown)
  const aba = abaPedida === 'anexos' ? 'anexos' : 'texto'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo={`Regulamento, versão ${versao.numero}`}
        descricao={
          versao.vigenteDesde
            ? `Em vigor desde ${formatarDataHora(versao.vigenteDesde)}.`
            : 'Aguardando a assinatura de todos os fundadores (art. 46).'
        }
      />
      <nav aria-label="Documentos relacionados" className="flex gap-4 text-sm">
        <Link href="/atas" className="underline underline-offset-4">
          ATAs
        </Link>
        <Link href="/bloqueados" className="underline underline-offset-4">
          Anexo I
        </Link>
      </nav>
      <p className="text-xs text-muted-foreground">
        sha256 <span className="font-mono break-all">{versao.sha256}</span>
      </p>
      <AbasNaUrl
        abas={[
          { id: 'texto', rotulo: 'Texto' },
          { id: 'anexos', rotulo: `Anexos (${String(anexos.length)})` },
        ]}
        ativa={aba}
        base="/regulamento"
      />
      {aba === 'anexos' ? (
        <AnexosDoRegulamento anexos={anexos} bloqueados={bloqueados} />
      ) : (
        <Markdown texto={corpo} />
      )}
    </div>
  )
}
