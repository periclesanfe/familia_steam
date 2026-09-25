import 'server-only'

import type { PerfilAtual } from '@/server/auth/perfil'
import { db } from '@/server/db'

/**
 * RN-ACE-12: o MEMBRO exporta a base inteira, exceto sessão, nonce, controle e os bytes dos
 * anexos (baixados à parte). O EX_* exporta só o que é dele. Nunca há chave Pix de terceiros
 * para o EX_* (RN-ACE-08).
 */
export async function exportar(p: PerfilAtual): Promise<Record<string, Record<string, unknown>[]>> {
  if (p.perfil === 'MEMBRO') {
    // ponytail: tudo em memória — a base inteira cabe em poucos MB (13 §1)
    const [
      pessoa,
      membro,
      integranteFamilia,
      versaoRegulamento,
      adesao,
      ciclo,
      participacaoCiclo,
      rodada,
      sorteio,
      declaracao,
      cessao,
      obrigacao,
      pagamento,
      avisoCompra,
      aquisicao,
      jogoBloqueado,
      votacao,
      voto,
      ata,
      anexo,
      eventoAuditoria,
      steamApp,
      jogoPossuido,
      itemListaDesejos,
    ] = await Promise.all([
      db.pessoa.findMany({
        where: { OR: [{ integrantes: { some: {} } }, { membros: { some: {} } }] },
      }), // 15 §3: só a família
      db.membro.findMany(),
      db.integranteFamilia.findMany(),
      db.versaoRegulamento.findMany(),
      db.adesao.findMany(),
      db.ciclo.findMany(),
      db.participacaoCiclo.findMany(),
      db.rodada.findMany(),
      db.sorteio.findMany(),
      db.declaracao.findMany(),
      db.cessao.findMany(),
      db.obrigacao.findMany(),
      db.pagamento.findMany(),
      db.avisoCompra.findMany(),
      db.aquisicao.findMany(),
      db.jogoBloqueado.findMany(),
      db.votacao.findMany(),
      db.voto.findMany(),
      db.ata.findMany(),
      db.anexo.findMany(),
      db.eventoAuditoria.findMany({ orderBy: { id: 'asc' } }),
      db.steamApp.findMany(), // catálogo público da Steam
      db.jogoPossuido.findMany({
        where: { pessoa: { OR: [{ integrantes: { some: {} } }, { membros: { some: {} } }] } },
      }),
      db.itemListaDesejos.findMany({
        where: { pessoa: { OR: [{ integrantes: { some: {} } }, { membros: { some: {} } }] } },
      }),
    ])
    return {
      pessoa,
      membro,
      integranteFamilia,
      versaoRegulamento,
      adesao,
      ciclo,
      participacaoCiclo,
      rodada,
      sorteio,
      declaracao,
      cessao,
      obrigacao,
      pagamento,
      avisoCompra,
      aquisicao,
      jogoBloqueado,
      votacao,
      voto,
      ata,
      anexo,
      eventoAuditoria,
      steamApp,
      jogoPossuido,
      itemListaDesejos,
    }
  }
  const eu = p.pessoaId
  const minhas = { OR: [{ devedorId: eu }, { credorId: eu }] }
  const [pessoa, adesao, declaracao, voto, obrigacao, pagamento] = await Promise.all([
    db.pessoa.findMany({ where: { id: eu } }),
    db.adesao.findMany({ where: { pessoaId: eu } }),
    db.declaracao.findMany({ where: { pessoaId: eu } }),
    db.voto.findMany({ where: { pessoaId: eu } }),
    db.obrigacao.findMany({ where: minhas }),
    db.pagamento.findMany({
      where: { obrigacao: minhas },
      omit: { chavePixDestinoMascarada: true },
    }),
  ])
  // ponytail: as ATAs que citam o ex-membro entram no M6
  return { pessoa, adesao, declaracao, voto, obrigacao, pagamento }
}
