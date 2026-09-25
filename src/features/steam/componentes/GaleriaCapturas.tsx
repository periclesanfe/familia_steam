'use client'

import { useState } from 'react'

import { cn } from '@/lib/utils'

// 15 §5: capturas da loja; a grande só carrega a escolhida, as miniaturas são leves.
export function GaleriaCapturas({
  miniaturas,
  grandes,
  nome,
}: {
  miniaturas: string[]
  grandes: string[]
  nome: string
}) {
  const [atual, setAtual] = useState(0)
  const grande = grandes[atual] ?? miniaturas[atual]
  if (!grande) return null
  return (
    <div className="flex flex-col gap-2">
      <a href={grande} target="_blank" rel="noopener noreferrer" title="Abrir em tamanho cheio">
        {/* eslint-disable-next-line @next/next/no-img-element -- CDN da Steam, sem otimizador (13 DP-12) */}
        <img
          src={grande}
          alt={`Captura ${String(atual + 1)} de ${nome}`}
          className="aspect-video w-full rounded-lg border bg-muted object-cover"
        />
      </a>
      {miniaturas.length > 1 && (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {miniaturas.map((m, i) => (
            <li key={m}>
              <button
                type="button"
                onClick={() => {
                  setAtual(i)
                }}
                aria-label={`Ver captura ${String(i + 1)}`}
                aria-pressed={i === atual}
                className={cn(
                  'block w-full overflow-hidden rounded-md border-2 transition-opacity duration-150',
                  i === atual
                    ? 'border-primary'
                    : 'border-transparent opacity-70 hover:opacity-100',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- idem */}
                <img src={m} alt="" loading="lazy" className="aspect-video w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
