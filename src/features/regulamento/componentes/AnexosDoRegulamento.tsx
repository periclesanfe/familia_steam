import { Markdown } from '@/components/Markdown'
import type { AnexoDoTexto } from '@/domain/regulamento'

import { TabelaAnexoI } from './TabelaAnexoI'

/** "ANEXO II — MODELO DE ATA" → "Anexo II — Modelo de ata" */
const tituloLegivel = (t: string) =>
  t
    .toLocaleLowerCase('pt-BR')
    .replace(/^./, (c) => c.toLocaleUpperCase('pt-BR'))
    .replace(/\banexo (i+)\b/i, (_, n: string) => `Anexo ${n.toUpperCase()}`)

// Anexos do Regulamento fora do texto corrido. O Anexo I vem da tabela viva (RN-BLO), que inclui
// os vetos aprovados depois da versão; o texto original continua íntegro (sha256).
export function AnexosDoRegulamento({
  anexos,
  bloqueados,
}: {
  anexos: AnexoDoTexto[]
  bloqueados: Parameters<typeof TabelaAnexoI>[0]['entradas']
}) {
  return (
    <div className="flex flex-col gap-3">
      {anexos.map((a) => {
        const anexoI = /^ANEXO I\b(?! I)/.test(a.titulo) && !a.titulo.startsWith('ANEXO II')
        return (
          <details
            key={a.titulo}
            className="group rounded-lg border bg-card px-4 py-3"
            open={anexoI}
          >
            <summary className="cursor-pointer font-medium">{tituloLegivel(a.titulo)}</summary>
            <div className="mt-3 flex flex-col gap-2">
              {anexoI ? (
                <>
                  <TabelaAnexoI entradas={bloqueados} />
                  <p className="text-xs text-muted-foreground">
                    Lista atualizada: inclui os jogos vetados por ATA depois desta versão.
                  </p>
                </>
              ) : (
                <Markdown texto={a.markdown} />
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}
