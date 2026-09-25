import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { env } from '@/server/env'
import { executarTick } from '@/server/tick'

export const maxDuration = 60

// 08 §7: chamado a cada 5 min com Authorization: Bearer <CRON_SECRET> (comparação em tempo constante).
export async function GET(req: Request) {
  const segredo = env().CRON_SECRET
  const recebido = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  const a = Buffer.from(recebido)
  const b = Buffer.from(segredo ?? '')
  if (!segredo || a.length !== b.length || !timingSafeEqual(a, b)) {
    return new NextResponse(null, { status: 401 })
  }
  return NextResponse.json(await executarTick())
}
