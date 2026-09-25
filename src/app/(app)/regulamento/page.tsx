import type { Metadata } from 'next'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Markdown } from '@/components/Markdown'
import { TabelaAnexoI } from '@/features/regulamento/componentes/TabelaAnexoI'
import { anexoI, versaoAplicavel } from '@/features/regulamento/consultas'
import { formatarDataHora } from '@/lib/formato'
import { paginaExige } from '@/server/auth/guardas'
import { agora } from '@/server/relogio'

export const metadata: Metadata = { title: 'Regulamento' }

// 07 §3.13: versão vigente com âncoras por artigo, Anexo I e versões.
export default async function RegulamentoPage() {
  await paginaExige(['MEMBRO', 'EX_COM_PENDENCIA', 'EX_QUITADO'])
  const [versao, bloqueados] = await Promise.all([versaoAplicavel(agora()), anexoI()])
  if (!versao) return <p className="text-sm text-muted-foreground">Nenhuma versão carregada.</p>

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
      <p className="text-xs text-muted-foreground">
        sha256 <span className="font-mono break-all">{versao.sha256}</span>
      </p>
      <Markdown texto={versao.textoMarkdown} />
      <section className="flex flex-col gap-3" aria-labelledby="anexo-i">
        <h2 id="anexo-i" className="text-lg font-semibold">
          Anexo I: Lista de Jogos Bloqueados
        </h2>
        <TabelaAnexoI entradas={bloqueados} />
      </section>
    </div>
  )
}
