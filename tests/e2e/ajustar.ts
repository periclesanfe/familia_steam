// CA-113: ajustes de estado que o E2E não faz pela tela (instantes da fábrica, cache da loja).
// Uso: tsx --conditions=react-server tests/e2e/ajustar.ts <acao> — imprime JSON no stdout.
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'

const dono = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 }),
})
const HADES = 1145350
const STARDEW = 413150

/** 15 §5: um jogo completo na biblioteca e na lista de um fundador (fotos, avaliações, preço). */
async function biblioteca() {
  const CDN = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${String(STARDEW)}`
  const dados = {
    nome: 'Stardew Valley',
    tipo: 'game',
    gratuito: false,
    categorias: [2, 62],
    descritoresConteudo: [],
    sucesso: true,
    precoFinalCentavos: 1249,
    precoInicialCentavos: 2499,
    descontoPct: 50,
    generos: ['Indie', 'RPG', 'Simulação'],
    descricaoCurta: 'Você herdou a antiga fazenda do seu avô.',
    capturas: [`${CDN}/a.600x338.jpg`, `${CDN}/b.600x338.jpg`],
    capturasGrandes: [`${CDN}/a.1920x1080.jpg`, `${CDN}/b.1920x1080.jpg`],
    avaliacaoNota: 9,
    avaliacoesPositivas: 980,
    avaliacoesTotal: 1000,
    jogadoresAgora: 36230,
    jogadoresEm: new Date(),
    detalhesEm: new Date(),
    precoEm: new Date(),
  }
  await dono.steamApp.upsert({
    where: { appId: STARDEW },
    create: { appId: STARDEW, ...dados },
    update: dados,
  })
  const ana = await dono.pessoa.findUniqueOrThrow({ where: { steamId64: '76561197960287930' } })
  await dono.jogoPossuido.upsert({
    where: { pessoaId_appId: { pessoaId: ana.id, appId: STARDEW } },
    create: { pessoaId: ana.id, appId: STARDEW, minutosJogados: 600, sincronizadoEm: new Date() },
    update: {},
  })
  const bruno = await dono.pessoa.findUniqueOrThrow({ where: { steamId64: '76561197960287931' } })
  await dono.itemListaDesejos.upsert({
    where: { pessoaId_origem_appId: { pessoaId: bruno.id, origem: 'STEAM', appId: STARDEW } },
    create: {
      pessoaId: bruno.id,
      origem: 'STEAM',
      appId: STARDEW,
      posicao: 99,
      adicionadoEm: new Date(),
    },
    update: {},
  })
  return { appId: STARDEW }
}

async function main(acao: string) {
  if (acao === 'biblioteca') return biblioteca()
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
