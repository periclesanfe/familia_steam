import { after, type NextRequest, NextResponse } from 'next/server'

import { nomeCookieState, opcoesCookieState } from '@/features/autenticacao/cookies'
import { entrarComSteam } from '@/features/autenticacao/servico'
import { sincronizarSeVencido } from '@/features/steam/servico'
import { validarRetorno, verificarNaSteam } from '@/server/auth/openid'
import { nomeCookieSessao, opcoesCookieSessao } from '@/server/auth/sessao'
import { env } from '@/server/env'
import { ipDe, permitir } from '@/server/limite'
import { log } from '@/server/log'
import { agora } from '@/server/relogio'

// RN-STM-01: valida o retorno da Steam e cria a sessão. Falhas vão só para o log (sem PII).
export async function GET(req: NextRequest) {
  const { APP_URL } = env()
  const ir = (caminho: string) => {
    const res = NextResponse.redirect(new URL(caminho, APP_URL))
    // o state vale para uma tentativa só, com sucesso ou com falha
    res.cookies.set(nomeCookieState(), '', { ...opcoesCookieState(), maxAge: 0 })
    return res
  }
  if (!permitir(`login:${ipDe(req.headers)}`, 10, 60_000)) return ir('/entrar?erro=limite')

  const t = agora()
  const r = validarRetorno(req.nextUrl.searchParams, {
    appUrl: APP_URL,
    stateCookie: req.cookies.get(nomeCookieState())?.value,
    agora: t,
  })
  if (!r.ok) {
    log.aviso('auth.falha', { motivo: r.motivo })
    return ir(
      r.motivo === 'STATE' || r.motivo === 'NONCE' ? '/entrar?erro=expirado' : '/entrar?erro=falha',
    )
  }

  let assinaturaValida = false
  try {
    assinaturaValida = await verificarNaSteam(r.parametros)
  } catch (e) {
    log.aviso('auth.falha', {
      motivo: 'STEAM_INDISPONIVEL',
      erro: e instanceof Error ? e.name : null,
    })
  }
  if (!assinaturaValida) {
    log.aviso('auth.falha', { motivo: 'ASSINATURA' })
    return ir('/entrar?erro=falha')
  }

  const entrada = await entrarComSteam({
    steamId64: r.steamId64,
    nonce: r.nonce,
    userAgent: req.headers.get('user-agent'),
    agora: t,
  })
  if (entrada.tipo === 'REPLAY') return ir('/entrar?erro=falha')
  if (entrada.tipo === 'NAO_AUTORIZADO') return ir('/entrar?erro=nao_autorizado')

  // RN-STM-04: sincroniza depois da resposta, sem atrasar o login (13 DP-13)
  after(() => sincronizarSeVencido(entrada.pessoaId))
  const res = ir(entrada.perfil === 'PENDENTE' ? '/boas-vindas' : '/')
  res.cookies.set(nomeCookieSessao(), entrada.token, opcoesCookieSessao())
  return res
}
