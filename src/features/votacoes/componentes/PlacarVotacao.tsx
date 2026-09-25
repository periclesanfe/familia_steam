// 07 §6.2: barras a favor, contra, abstenção e pendentes, com a linha do quórum e nomes.
export function PlacarVotacao({
  votos,
  pendentes,
  n,
  quorum,
}: {
  votos: { nome: string; opcao: 'FAVOR' | 'CONTRA' | 'ABSTENCAO' }[]
  pendentes: string[]
  n: number
  quorum: number
}) {
  const grupos = [
    {
      rotulo: 'A favor',
      cor: 'bg-success',
      nomes: votos.filter((v) => v.opcao === 'FAVOR').map((v) => v.nome),
    },
    {
      rotulo: 'Contra',
      cor: 'bg-destructive',
      nomes: votos.filter((v) => v.opcao === 'CONTRA').map((v) => v.nome),
    },
    {
      rotulo: 'Abstenção',
      cor: 'bg-muted-foreground',
      nomes: votos.filter((v) => v.opcao === 'ABSTENCAO').map((v) => v.nome),
    },
    { rotulo: 'Não votaram', cor: 'bg-border', nomes: pendentes },
  ]
  const pct = (x: number) => `${String((x / Math.max(n, 1)) * 100)}%`
  return (
    <div className="flex flex-col gap-3">
      {grupos.map((g) => (
        <div key={g.rotulo} className="flex flex-col gap-1">
          <div className="flex justify-between text-sm">
            <span className="font-medium">{g.rotulo}</span>
            <span className="tabular-nums">{g.nomes.length}</span>
          </div>
          <div className="relative h-2 rounded-full bg-muted" aria-hidden>
            <div
              className={`h-2 rounded-full ${g.cor} motion-safe:transition-[width] motion-safe:duration-300`}
              style={{ width: pct(g.nomes.length) }}
            />
            {g.rotulo === 'A favor' && (
              <div
                className="absolute -top-0.5 h-3 w-0.5 bg-foreground"
                style={{ left: pct(quorum) }}
                title={`Quórum: ${String(quorum)}`}
              />
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {g.nomes.length > 0 ? g.nomes.join(', ') : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}
