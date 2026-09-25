import type { Metadata } from 'next'
import Link from 'next/link'
import { forbidden, notFound } from 'next/navigation'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { EditorRegulamento } from '@/features/regulamento/componentes/EditorRegulamento'
import { estadoDoEditor, progressoDasAssinaturas } from '@/features/regulamento/consultas'
import { formatarDataHora } from '@/lib/formato'
import { paginaExige } from '@/server/auth/guardas'
import { agora } from '@/server/relogio'

export const metadata: Metadata = { title: 'Editar o Regulamento' }

// RN-REG-08: antes da vigência, edição do rascunho; RN-REG-03: depois, proposta por votação.
export default async function EditarRegulamentoPage() {
  const { perfil } = await paginaExige(['PENDENTE', 'MEMBRO'])
  const e = await estadoDoEditor(agora())
  if (!e) notFound()
  if (e.modo === 'proposta' && perfil !== 'MEMBRO') forbidden()
  const assinaturas = e.modo === 'rascunho' ? (await progressoDasAssinaturas(e)).assinaram : 0

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo={
          e.modo === 'rascunho'
            ? 'Editar o rascunho do Regulamento'
            : 'Propor alteração do Regulamento'
        }
        descricao={
          e.modo === 'rascunho'
            ? 'Antes do acordo entrar em vigor, qualquer membro da família ajusta o texto. Cada mudança fica registrada e as assinaturas recomeçam.'
            : `O Regulamento ${e.numero} está em vigor: a mudança vai a votação de todos os membros (art. 42).`
        }
      />
      {e.modo === 'proposta' && e.votacaoAberta ? (
        <Alert>
          <AlertTitle>Já há uma alteração do Regulamento em votação.</AlertTitle>
          <AlertDescription>
            Encerra em {formatarDataHora(e.votacaoAberta.encerraEm)}. Uma por vez: vote nela ou
            aguarde o resultado.
            <Link
              href={`/votacoes/${e.votacaoAberta.id}`}
              className="mt-2 block font-medium underline underline-offset-4"
            >
              Ver a votação
            </Link>
          </AlertDescription>
        </Alert>
      ) : (
        <EditorRegulamento
          modo={e.modo}
          numero={e.numero}
          textoBase={e.texto}
          parametrosBase={e.parametros}
          assinaturas={assinaturas}
        />
      )}
    </div>
  )
}
