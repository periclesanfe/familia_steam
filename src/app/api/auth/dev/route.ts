import { type NextRequest, NextResponse } from 'next/server'

import { entrarComSteam } from '@/features/autenticacao/servico'
import { nomeCookieSessao, opcoesCookieSessao } from '@/server/auth/sessao'
import { env, loginDevHabilitado } from '@/server/env'
import { agora } from '@/server/relogio'

// RN-ACE-14: login de desenvolvimento e E2E. Em produção responde 404 (CA-104).
export async function GET(req: NextRequest) {
  if (!loginDevHabilitado()) return new NextResponse(null, { status: 404 })
  const steamId64 = req.nextUrl.searchParams.get('steamId64') ?? ''
  if (!/^7656119\d{10}$/.test(steamId64)) return new NextResponse(null, { status: 400 })
  const t = agora()
  const entrada = await entrarComSteam({
    steamId64,
    nonce: `dev:${steamId64}:${String(t.getTime())}:${String(Math.random())}`,
    userAgent: req.headers.get('user-agent'),
    agora: t,
  })
  if (entrada.tipo !== 'OK') return new NextResponse(null, { status: 403 })
  const res = NextResponse.redirect(
    new URL(entrada.perfil === 'PENDENTE' ? '/boas-vindas' : '/', env().APP_URL),
  )
  res.cookies.set(nomeCookieSessao(), entrada.token, opcoesCookieSessao())
  return res
}
