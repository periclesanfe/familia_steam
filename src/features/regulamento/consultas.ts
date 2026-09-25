import 'server-only'

import { adesaoValida, versaoVigente } from '@/domain/regulamento'
import { deDb } from '@/domain/tempo'
import { db } from '@/server/db'

/** Versão vigente, ou a 1.0 aguardando assinaturas (RN-REG-02/04). */
export async function versaoAplicavel(agora: Date) {
  const versoes = await db.versaoRegulamento.findMany({
    select: { id: true, ordem: true, numero: true, sha256: true, vigenteDesde: true },
    orderBy: { ordem: 'asc' },
  })
  const alvo = versaoVigente(versoes, agora) ?? versoes.find((v) => v.ordem === 0) ?? null
  if (!alvo) return null
  const { textoMarkdown } = await db.versaoRegulamento.findUniqueOrThrow({
    where: { id: alvo.id },
    select: { textoMarkdown: true },
  })
  return { ...alvo, textoMarkdown, versoes }
}

/** Anexo I (RN-BLO): entradas vigentes e excluídas. */
export const anexoI = async () =>
  (
    await db.jogoBloqueado.findMany({
      orderBy: { numero: 'asc' },
      select: {
        numero: true,
        nome: true,
        dataVeto: true,
        origemTexto: true,
        motivo: true,
        ataInclusaoNumero: true,
        excluidoEm: true,
        ataExclusaoNumero: true,
      },
    })
  ).map((j) => ({ ...j, dataVeto: j.dataVeto ? deDb(j.dataVeto) : null }))

/** Quantos fundadores já têm adesão válida à versão (tela de espera do onboarding). */
export async function progressoDasAssinaturas(versao: { id: string; sha256: string }) {
  const fundadores = await db.membro.findMany({
    where: { origem: 'FUNDADOR', status: { not: 'ENCERRADO' } },
    select: {
      pessoa: {
        select: {
          steamId64: true,
          adesoes: {
            where: { versaoId: versao.id },
            select: { sha256Versao: true, codigoAmigo: true },
          },
        },
      },
    },
  })
  const assinaram = fundadores.filter((f) =>
    f.pessoa.adesoes.some((a) => adesaoValida(a, versao, { steamId64: f.pessoa.steamId64 ?? '' })),
  ).length
  return { assinaram, total: fundadores.length }
}
