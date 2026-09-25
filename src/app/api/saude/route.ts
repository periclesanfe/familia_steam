import { db } from '@/server/db'

// Usado pelo HEALTHCHECK do Docker e por monitor externo (docs/spec/08 §8.3).
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    return Response.json({ ok: true, db: true })
  } catch {
    return Response.json({ ok: false, db: false }, { status: 503 })
  }
}
