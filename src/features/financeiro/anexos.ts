import 'server-only'

import type { PerfilAtual } from '@/server/auth/perfil'
import { db } from '@/server/db'

const EXTENSAO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}

/**
 * RN-ACE-09: quem baixa. MEMBRO: qualquer anexo vinculado. EX_*: os que enviou e os comprovantes
 * de pagamentos de obrigações em que é devedor ou credor. PENDENTE e anexo solto: só quem enviou.
 * Qualquer outro caso é "não existe" (404), sem revelar que o arquivo existe.
 */
export async function anexoParaDownload(id: string, p: PerfilAtual) {
  const a = await db.anexo.findUnique({ where: { id }, omit: { conteudo: false } })
  if (!a?.conteudo) return null
  const proprio = a.enviadoPorId === p.pessoaId
  let pode = proprio
  if (!pode && a.entidadeId !== null) {
    if (p.perfil === 'MEMBRO') pode = true
    else if (p.perfil === 'EX_COM_PENDENCIA' || p.perfil === 'EX_QUITADO') {
      pode =
        (await db.pagamento.count({
          where: {
            comprovanteId: a.id,
            obrigacao: { OR: [{ devedorId: p.pessoaId }, { credorId: p.pessoaId }] },
          },
        })) > 0
    }
  }
  if (!pode) return null
  return {
    conteudo: a.conteudo,
    mime: a.mime,
    nome: `anexo-${a.id}.${EXTENSAO[a.mime] ?? 'bin'}`,
  }
}
