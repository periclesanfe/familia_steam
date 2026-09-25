import 'server-only'

import { sincronizarPessoas } from '@/features/steam/sync'
import { db } from '@/server/db'
import { env } from '@/server/env'

const SETE_DIAS = 7 * 86_400_000

/**
 * RN-COM-11: até 7 dias depois da compra, confere a biblioteca do contemplado. DLC ou perfil
 * privado → NAO_VERIFICAVEL (o contemplado anexa print); ausente → NAO_ENCONTRADO (alerta).
 */
export async function verificarCompras(agora: Date): Promise<number> {
  const pendentes = await db.aquisicao.findMany({
    where: {
      verificacaoBiblioteca: 'PENDENTE',
      registradaEm: { gte: new Date(agora.getTime() - SETE_DIAS) },
    },
    select: { id: true, appId: true, rodada: { select: { contempladoId: true } } },
  })
  if (pendentes.length === 0) return 0
  const pessoas = [
    ...new Set(pendentes.flatMap((p) => (p.rodada.contempladoId ? [p.rodada.contempladoId] : []))),
  ]
  if (env().STEAM_API_KEY) await sincronizarPessoas(pessoas)
  const [apps, donos, publicos] = await Promise.all([
    db.steamApp.findMany({
      where: { appId: { in: pendentes.map((p) => p.appId) } },
      select: { appId: true, tipo: true },
    }),
    db.jogoPossuido.findMany({
      where: { pessoaId: { in: pessoas }, appId: { in: pendentes.map((p) => p.appId) } },
      select: { pessoaId: true, appId: true },
    }),
    db.pessoa.findMany({
      where: { id: { in: pessoas } },
      select: { id: true, steamJogosPublicos: true },
    }),
  ])
  let mudou = 0
  for (const p of pendentes) {
    const contemplado = p.rodada.contempladoId
    if (!contemplado) continue
    const dlc = apps.find((a) => a.appId === p.appId)?.tipo === 'dlc'
    const publico = publicos.find((x) => x.id === contemplado)?.steamJogosPublicos === true
    const tem = donos.some((d) => d.pessoaId === contemplado && d.appId === p.appId)
    const resultado = dlc || !publico ? 'NAO_VERIFICAVEL' : tem ? 'VERIFICADO' : null
    if (!resultado) continue // tenta de novo no próximo tick; depois de 7 dias sai da fila como PENDENTE
    // eslint-disable-next-line no-await-in-loop -- poucas aquisições pendentes
    await db.aquisicao.update({ where: { id: p.id }, data: { verificacaoBiblioteca: resultado } })
    mudou++
  }
  // passado o prazo sem aparecer: NAO_ENCONTRADO
  const { count } = await db.aquisicao.updateMany({
    where: {
      verificacaoBiblioteca: 'PENDENTE',
      registradaEm: { lt: new Date(agora.getTime() - SETE_DIAS) },
    },
    data: { verificacaoBiblioteca: 'NAO_ENCONTRADO' },
  })
  return mudou + count
}
