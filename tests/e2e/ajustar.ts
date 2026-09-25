// CA-113: ajustes de estado que o E2E não faz pela tela (instantes da fábrica, cache da loja).
// Uso: tsx --conditions=react-server tests/e2e/ajustar.ts <acao> — imprime JSON no stdout.
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'

const dono = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 }),
})
const HADES = 1145350

async function main(acao: string) {
  const r1 = await dono.rodada.findFirstOrThrow({
    where: { sequencia: 1, ciclo: { numero: 1 } },
    include: { contemplado: { select: { steamId64: true } } },
  })
  switch (acao) {
    case 'sorteio-vencido':
      await dono.rodada.update({
        where: { id: r1.id },
        data: { agendadaPara: new Date(Date.now() - 60_000) },
      })
      return { rodadaId: r1.id }
    case 'rodada':
      return {
        rodadaId: r1.id,
        status: r1.status,
        contemplado: r1.contemplado?.steamId64 ?? null,
        sobraCentavos: r1.sobraCentavos,
        executadaEm: r1.executadaEm?.getTime() ?? null,
      }
    case 'loja': // cache recente da loja e bibliotecas públicas: o aviso não chama a Steam
      await dono.pessoa.updateMany({ data: { steamJogosPublicos: true } })
      await dono.steamApp.upsert({
        where: { appId: HADES },
        create: {
          appId: HADES,
          nome: 'Hades II',
          tipo: 'game',
          gratuito: false,
          categorias: [2, 62],
          descritoresConteudo: [],
          sucesso: true,
          detalhesEm: new Date(),
          precoEm: new Date(),
        },
        update: { detalhesEm: new Date(), precoEm: new Date() },
      })
      return { appId: HADES }
    case 'janela-vencida': // +48 h simulado recuando o aviso
      await dono.avisoCompra.updateMany({
        where: { rodadaId: r1.id, substituidoEm: null },
        data: {
          avisadoEm: new Date(Date.now() - 49 * 3_600_000),
          janelaVetoAte: new Date(Date.now() - 3_600_000),
        },
      })
      return { ok: true }
    default:
      throw new Error(`ação desconhecida: ${acao}`)
  }
}

main(process.argv[2] ?? '')
  .then((r) => {
    process.stdout.write(JSON.stringify(r))
  })
  .catch((e: unknown) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => void dono.$disconnect())
