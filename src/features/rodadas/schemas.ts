import { z } from 'zod'

export const rodadaSchema = z.object({ rodadaId: z.uuid() })

export const justificativaSchema = z.object({
  rodadaId: z.uuid(),
  texto: z.string().trim().min(10, 'Explique em pelo menos 10 caracteres (art. 11, p.u.)').max(500),
})
