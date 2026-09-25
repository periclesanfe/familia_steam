import { db } from '@/server/db'

// Usado pelo HEALTHCHECK do Docker e por monitor externo (08 §8.3): alerta se o tick parar.
export async function GET() {
  try {
    const ultimo = await db.controle.findUnique({
      where: { chave: 'ultimo_tick' },
      select: { atualizadoEm: true },
    })
    return Response.json({ ok: true, db: true, ultimoTick: ultimo?.atualizadoEm ?? null })
  } catch {
    return Response.json({ ok: false, db: false }, { status: 503 })
  }
}
