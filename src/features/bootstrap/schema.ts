import { z } from 'zod'

import { PARAMETROS_1_0, parametrosSchema } from '@/domain/regulamento'

// RN-CAD-01: SteamID64 de conta individual (o mesmo intervalo do CHECK do banco).
export const steamId64Schema = z
  .string()
  .regex(/^\d{17}$/, 'SteamID64 tem 17 dígitos')
  .refine(
    (v) => /^\d{17}$/.test(v) && BigInt(v) >= 76561197960265729n && BigInt(v) <= 76561202255233023n,
    'SteamID64 fora do intervalo de contas individuais',
  )

/** Aceita o SteamID64 ou a URL /profiles/<id>. URL personalizada (/id/nome) precisa da Web API (M3). */
const contaSteam = z.string().transform((v, ctx) => {
  const id =
    /^https?:\/\/steamcommunity\.com\/profiles\/(\d{17})\/?$/.exec(v.trim())?.[1] ?? v.trim()
  const r = steamId64Schema.safeParse(id)
  if (!r.success) {
    ctx.addIssue({ code: 'custom', message: `conta Steam inválida: ${v}` })
    return z.NEVER
  }
  return r.data
})

const dataCivil = z.iso.date()

/** Formato do bootstrap.json (RN-ACE-10). */
export const bootstrapSchema = z
  .strictObject({
    regulamento: z.string().min(1), // caminho do texto final da 1.0
    parametros: parametrosSchema.default(PARAMETROS_1_0),
    fundadores: z
      .array(
        z.strictObject({
          nome: z.string().trim().min(2),
          apelido: z.string().trim().min(1),
          steam: contaSteam,
          entrouNaFamiliaEm: dataCivil,
        }),
      )
      .min(2),
    integrantes: z
      .array(
        z.strictObject({
          apelido: z.string().trim().min(1),
          steam: contaSteam.optional(),
          entrouNaFamiliaEm: dataCivil,
        }),
      )
      .default([]),
  })
  .superRefine((b, ctx) => {
    const apelidos = [...b.fundadores, ...b.integrantes].map((p) => p.apelido.toLowerCase())
    if (new Set(apelidos).size !== apelidos.length) {
      ctx.addIssue({ code: 'custom', message: 'apelidos repetidos no arquivo' })
    }
    const contas = [...b.fundadores, ...b.integrantes].flatMap((p) => (p.steam ? [p.steam] : []))
    if (new Set(contas).size !== contas.length) {
      ctx.addIssue({ code: 'custom', message: 'contas Steam repetidas no arquivo' })
    }
  })

export type Bootstrap = z.output<typeof bootstrapSchema>
