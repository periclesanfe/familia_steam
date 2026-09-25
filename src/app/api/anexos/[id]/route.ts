import { NextResponse } from 'next/server'

import { anexoParaDownload } from '@/features/financeiro/anexos'
import { perfilDe } from '@/server/auth/perfil'
import { obterSessao } from '@/server/auth/sessao'
import { comFamilia } from '@/server/familia'

// RN-ACE-09 / 14 SEG-07: download autenticado; o nome enviado pelo cliente nunca é usado.
export async function GET(_: Request, { params }: RouteContext<'/api/anexos/[id]'>) {
  const naoEncontrado = () => new NextResponse(null, { status: 404 })
  const sessao = await obterSessao()
  if (!sessao) return naoEncontrado()
  const perfil = await perfilDe(sessao.pessoaId)
  if (!perfil) return naoEncontrado()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return naoEncontrado()
  const a = await comFamilia(perfil.familiaId, () => anexoParaDownload(id, perfil)) // 15 §4
  if (!a) return naoEncontrado()
  const pdf = a.mime === 'application/pdf'
  return new NextResponse(Buffer.from(a.conteudo), {
    headers: {
      'Content-Type': a.mime,
      'Content-Disposition': `${pdf ? 'attachment' : 'inline'}; filename="${a.nome}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': 'sandbox',
    },
  })
}
