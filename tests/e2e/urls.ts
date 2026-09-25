export const URLS_TESTE = {
  app: process.env.TEST_DATABASE_URL ?? 'postgresql://app_rw:app_rw@localhost:5433/consorcio_teste',
  dono:
    process.env.TEST_MIGRATE_DATABASE_URL ??
    'postgresql://app_owner:app_owner@localhost:5433/consorcio_teste',
}
export const PORTA_E2E = 3101
