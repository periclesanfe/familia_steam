import { z } from 'zod'

// Variáveis de ambiente (docs/spec/08 §8.1). Validadas no boot do servidor
// (src/instrumentation.ts), não na importação: o `next build` avalia módulos sem o .env.
// Variável vazia no .env (ex.: `STEAM_API_KEY=`) conta como ausente.
const opcional = <T extends z.ZodType>(tipo: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), tipo.optional())

const usaHttps = (url: string) => new URL(url).protocol === 'https:'
const ehLocal = (url: string) => ['localhost', '127.0.0.1'].includes(new URL(url).hostname)

const esquema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.url(),
    APP_URL: z.url().default('http://localhost:3100'),
    STEAM_API_KEY: opcional(z.string().min(1)),
    CRON_SECRET: opcional(z.string().min(32)),
    DEV_LOGIN: z.enum(['0', '1']).default('0'),
  })
  .refine((e) => !(e.NODE_ENV === 'production' && e.DEV_LOGIN === '1'), {
    message: 'DEV_LOGIN=1 é proibido em produção (RN-ACE-14)',
    path: ['DEV_LOGIN'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || usaHttps(e.APP_URL) || ehLocal(e.APP_URL), {
    message: 'Em produção, APP_URL precisa ser https (14 SEG-02)',
    path: ['APP_URL'],
  })

export type Env = z.infer<typeof esquema>

let validado: Env | undefined

export const lerEnv = (fonte: Record<string, string | undefined>): Env => esquema.parse(fonte)

export const env = (): Env => (validado ??= lerEnv(process.env))

/** SEG-02: prefixo `__Host-` e `Secure` só quando a URL pública é https. */
export const cookieSeguro = (): boolean => usaHttps(env().APP_URL)
