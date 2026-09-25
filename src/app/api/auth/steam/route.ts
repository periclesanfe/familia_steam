import { randomBytes } from 'node:crypto'

import { type NextRequest, NextResponse } from 'next/server'

import { nomeCookieState, opcoesCookieState } from '@/features/autenticacao/cookies'
import { urlDeLogin } from '@/server/auth/openid'
import { env } from '@/server/env'
import { ipDe, permitir } from '@/server/limite'

// RN-STM-02: inicia o login. O state vai no cookie e no return_to.
export function GET(req: NextRequest) {
  const { APP_URL } = env()
  if (!permitir(`login:${ipDe(req.headers)}`, 10, 60_000)) {
    return NextResponse.redirect(new URL('/entrar?erro=limite', APP_URL))
  }
  const state = randomBytes(32).toString('base64url')
  const res = NextResponse.redirect(urlDeLogin(APP_URL, state))
  res.cookies.set(nomeCookieState(), state, opcoesCookieState())
  return res
}
