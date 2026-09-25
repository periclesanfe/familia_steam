import 'server-only'

import { cookieSeguro } from '@/server/env'

// 06 §2 item 2 / 14 SEG-02: __Secure- permite restringir o Path (o __Host- exige Path=/).
export const nomeCookieState = (): string =>
  cookieSeguro() ? '__Secure-steam_state' : 'steam_state'

export const opcoesCookieState = () =>
  ({
    httpOnly: true,
    secure: cookieSeguro(),
    sameSite: 'lax',
    path: '/api/auth/steam',
    maxAge: 600,
  }) as const
