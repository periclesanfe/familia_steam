import 'server-only'

import { createHash } from 'node:crypto'

import { validarArquivo } from '@/domain/anexo'
import { ErroDeNegocio } from '@/domain/erros'
import type { TipoAnexo } from '@/generated/prisma/enums'

import { type Contexto, registrarEvento } from './auditoria'
import type { Tx } from './db'

const MOTIVOS = {
  VAZIO: 'Arquivo vazio.',
  GRANDE_DEMAIS: 'O arquivo passa de 5 MB.',
  TIPO_NAO_ACEITO: 'Envie JPEG, PNG, WebP ou PDF.',
} as const

/**
 * RN-ACE-09: grava um anexo ainda não vinculado (entidade nula), enviado pelo próprio ator.
 * O vínculo acontece depois, na action que o usa, na mesma transação da mutação.
 */
export async function salvarAnexo(
  tx: Tx,
  ctx: Contexto & { ator: { tipo: 'MEMBRO'; pessoaId: string } },
  tipo: TipoAnexo,
  arquivo: File,
): Promise<{ id: string }> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  const r = validarArquivo(bytes)
  if (!r.ok) throw new ErroDeNegocio('ENTRADA_INVALIDA', MOTIVOS[r.motivo])
  const anexo = await tx.anexo.create({
    data: {
      tipo,
      mime: r.mime,
      tamanhoBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      conteudo: bytes,
      enviadoPorId: ctx.ator.pessoaId,
      enviadoEm: ctx.agora,
    },
    select: { id: true },
  })
  await registrarEvento(tx, ctx, {
    acao: 'anexo.enviar',
    entidade: 'anexo',
    entidadeId: anexo.id,
    dados: { depois: { tipo, mime: r.mime, tamanhoBytes: bytes.length } },
  })
  return anexo
}
