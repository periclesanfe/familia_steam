'use client'

import { Bar, BarChart, CartesianGrid, Label, Pie, PieChart, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const configRodadas = {
  premio: { label: 'Prêmio', color: 'var(--chart-1)' },
  arrecadado: { label: 'Arrecadado', color: 'var(--chart-2)' },
  gasto: { label: 'Gasto no jogo', color: 'var(--chart-3)' },
} satisfies ChartConfig

const COR_SITUACAO: Record<string, { label: string; color: string }> = {
  QUITADA: { label: 'Quitada', color: 'var(--success)' },
  AUTOQUITADA: { label: 'Do contemplado', color: 'var(--chart-1)' },
  NO_PRAZO: { label: 'No prazo', color: 'var(--chart-5)' },
  PRORROGADA: { label: 'Prorrogada', color: 'var(--warning)' },
  QUITADA_EM_ATRASO: { label: 'Quitada em atraso', color: 'var(--chart-3)' },
  EM_ATRASO: { label: 'Em atraso', color: 'var(--destructive)' },
  CANCELADA: { label: 'Cancelada', color: 'var(--muted-foreground)' },
}

const configBiblioteca = {
  jogos: { label: 'Jogos', color: 'var(--chart-2)' },
} satisfies ChartConfig

// 07 §3.3 (rev. M10): visualizações do painel; os números também aparecem nos cards (UI-03).
export function GraficosPainel({
  porRodada,
  situacoes,
  biblioteca,
  jogosUnicos,
}: {
  porRodada: { rodada: string; premio: number; arrecadado: number; gasto: number }[]
  situacoes: { situacao: string; total: number }[]
  biblioteca: { pessoa: string; jogos: number }[]
  jogosUnicos: number
}) {
  const totalContrib = situacoes.reduce((s, x) => s + x.total, 0)
  // recharts 3: a cor de cada fatia vai no próprio dado (Cell está obsoleto)
  const fatias = situacoes.map((x) => ({
    ...x,
    fill: COR_SITUACAO[x.situacao]?.color ?? 'var(--muted-foreground)',
  }))
  const configSituacao = Object.fromEntries(
    situacoes.map((s) => [s.situacao, COR_SITUACAO[s.situacao] ?? { label: s.situacao }]),
  ) satisfies ChartConfig
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Arrecadação por rodada</CardTitle>
          <CardDescription>
            Prêmio, quanto já entrou e o gasto com o jogo, em reais.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {porRodada.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Os números aparecem depois do primeiro sorteio.
            </p>
          ) : (
            <ChartContainer config={configRodadas} className="aspect-auto h-64 w-full">
              <BarChart data={porRodada} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="rodada" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={48} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => brl(Number(v))} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="premio" fill="var(--color-premio)" radius={4} maxBarSize={40} />
                <Bar
                  dataKey="arrecadado"
                  fill="var(--color-arrecadado)"
                  radius={4}
                  maxBarSize={40}
                />
                <Bar dataKey="gasto" fill="var(--color-gasto)" radius={4} maxBarSize={40} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contribuições do ciclo</CardTitle>
          <CardDescription>Situação de cada contribuição.</CardDescription>
        </CardHeader>
        <CardContent>
          {totalContrib === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma contribuição ainda.
            </p>
          ) : (
            <ChartContainer config={configSituacao} className="mx-auto aspect-square h-64">
              <PieChart accessibilityLayer>
                <ChartTooltip content={<ChartTooltipContent nameKey="situacao" hideLabel />} />
                <Pie
                  data={fatias}
                  dataKey="total"
                  nameKey="situacao"
                  innerRadius={60}
                  strokeWidth={4}
                >
                  <Label
                    content={({ viewBox }) =>
                      viewBox && 'cx' in viewBox ? (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy}
                            className="fill-foreground text-2xl font-semibold"
                          >
                            {totalContrib}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy + 20}
                            className="fill-muted-foreground text-xs"
                          >
                            contribuições
                          </tspan>
                        </text>
                      ) : null
                    }
                  />
                </Pie>
                <ChartLegend
                  content={<ChartLegendContent nameKey="situacao" />}
                  className="flex-wrap gap-2"
                />
              </PieChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Biblioteca da família</CardTitle>
          <CardDescription>
            {jogosUnicos} jogos diferentes somando as bibliotecas; jogos por integrante.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {biblioteca.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              As bibliotecas aparecem depois da sincronização com a Steam.
            </p>
          ) : (
            <ChartContainer
              config={configBiblioteca}
              className="aspect-auto w-full"
              style={{ height: Math.max(160, biblioteca.length * 36) }}
            >
              <BarChart data={biblioteca} layout="vertical" accessibilityLayer margin={{ left: 8 }}>
                <CartesianGrid horizontal={false} />
                <YAxis
                  dataKey="pessoa"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={96}
                />
                <XAxis type="number" hide />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="jogos" fill="var(--color-jogos)" radius={4} maxBarSize={28} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
