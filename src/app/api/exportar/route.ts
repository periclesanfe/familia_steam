import { NextResponse, type NextRequest } from 'next/server'

import { exportar } from '@/features/financeiro/exportacao'
import { paraCsv } from '@/lib/csv'
import { perfilDe } from '@/server/auth/perfil'
import { obterSessao } from '@/server/auth/sessao'
import { comFamilia } from '@/server/familia'
import { agora } from '@/server/relogio'

// RN-ACE-12: ?formato=json (tudo num arquivo) ou ?formato=csv&tabela=<nome> (uma tabela).
export async function GET(req: NextRequest) {
  const sessao = await obterSessao()
  const perfil = sessao && (await perfilDe(sessao.pessoaId))
  if (!perfil || perfil.perfil === 'PENDENTE' || perfil.perfil === 'VISITANTE') {
    return new NextResponse(null, { status: 404 })
  }
  const dados = await comFamilia(perfil.familiaId, () => exportar(perfil)) // 15 §4
  const dia = agora().toISOString().slice(0, 10)
  const cabecalhos = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  const formato = req.nextUrl.searchParams.get('formato') ?? 'json'

  if (formato === 'csv') {
    const tabela = req.nextUrl.searchParams.get('tabela') ?? ''
    const linhas = Object.hasOwn(dados, tabela) ? dados[tabela] : undefined
    if (!linhas) return NextResponse.json({ tabelas: Object.keys(dados) }, { status: 400 })
    return new NextResponse(`﻿${paraCsv(linhas)}`, {
      headers: {
        ...cabecalhos,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="consorcio-${tabela}-${dia}.csv"`,
      },
    })
  }
  return new NextResponse(
    JSON.stringify({ exportadoEm: agora(), perfil: perfil.perfil, dados }, null, 2),
    {
      headers: {
        ...cabecalhos,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="consorcio-${dia}.json"`,
      },
    },
  )
}
