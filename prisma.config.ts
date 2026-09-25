// Prisma 7 não carrega .env sozinho. O fallback vazio permite `prisma generate`
// (postinstall, build do Docker) sem banco disponível. Ver docs/spec/08 §3.
// A CLI (migrações) usa o papel dono, app_owner; o app usa app_rw (14 SEG-08).
import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '' },
})
