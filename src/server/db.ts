import 'server-only'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'

// Pool pequeno: 5 usuários e uma instância (docs/spec/13). O pool só conecta na 1ª query,
// então o módulo pode ser avaliado no build sem banco. O env é validado no boot (instrumentation).
const criarCliente = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5 }),
  })

const globalComPrisma = globalThis as unknown as { prisma?: ReturnType<typeof criarCliente> }

export const db = globalComPrisma.prisma ?? criarCliente()

if (process.env.NODE_ENV !== 'production') globalComPrisma.prisma = db
