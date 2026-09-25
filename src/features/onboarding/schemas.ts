import { z } from 'zod'

import { TipoChavePix } from '@/generated/prisma/enums'

const soDigitos = (v: string) => v.replace(/\D/g, '')

/** RN-CAD-05: chave Pix normalizada e validada pelo tipo. */
export const dadosCadastroSchema = z
  .object({
    nome: z.string().trim().min(3, 'Informe o nome completo').max(120),
    apelido: z.string().trim().min(1, 'Informe um apelido').max(40),
    tipoChavePix: z.enum(TipoChavePix, 'Escolha o tipo da chave'),
    chavePix: z.string().trim().min(1, 'Informe a chave Pix').max(140),
    maioridade: z.literal('on', 'É preciso ser maior de idade (art. 2º, II)'),
  })
  .transform((d, ctx) => {
    const k = d.chavePix
    const regras: Record<TipoChavePix, [string | null, string]> = {
      CPF: [/^\d{11}$/.test(soDigitos(k)) ? soDigitos(k) : null, 'CPF com 11 dígitos'],
      CNPJ: [/^\d{14}$/.test(soDigitos(k)) ? soDigitos(k) : null, 'CNPJ com 14 dígitos'],
      TELEFONE: [
        /^55\d{10,11}$/.test(soDigitos(k))
          ? `+${soDigitos(k)}`
          : /^\d{10,11}$/.test(soDigitos(k))
            ? `+55${soDigitos(k)}`
            : null,
        'telefone com DDD',
      ],
      EMAIL: [
        z.email().safeParse(k.toLowerCase()).success ? k.toLowerCase() : null,
        'e-mail válido',
      ],
      ALEATORIA: [
        z.uuid().safeParse(k.toLowerCase()).success ? k.toLowerCase() : null,
        'chave aleatória (formato UUID)',
      ],
    }
    const [normalizada, esperado] = regras[d.tipoChavePix]
    if (!normalizada) {
      ctx.addIssue({
        code: 'custom',
        path: ['chavePix'],
        message: `Chave inválida: informe ${esperado}`,
      })
      return z.NEVER
    }
    return { nome: d.nome, apelido: d.apelido, tipoChavePix: d.tipoChavePix, chavePix: normalizada }
  })

export const assinaturaSchema = z.object({
  declaracao: z.literal('on', 'Marque a declaração para assinar'),
  contaUnica: z.literal('on', 'Confirme que não participa com outra conta Steam (RN-CAD-03)'),
})
