// 12 UI-17: lê os tokens de src/app/globals.css e falha se algum par ficar abaixo do WCAG 2.2 AA.
// OKLCH → sRGB → luminância relativa. Sem dependências.
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')

const lerTokens = (bloco) =>
  Object.fromEntries(
    [...bloco.matchAll(/--([\w-]+):\s*oklch\(([^)]+)\)/g)].map(([, nome, v]) => {
      const [cor, alfa] = v.split('/')
      const [l, c, h] = cor.trim().split(/\s+/).map(Number)
      return [
        nome,
        { lch: [l, c, h], alfa: alfa ? parseFloat(alfa) / (alfa.includes('%') ? 100 : 1) : 1 },
      ]
    }),
  )

const inicioEscuro = css.indexOf('@media (prefers-color-scheme: dark) {')
const claro = lerTokens(css.slice(css.indexOf(':root {'), inicioEscuro))
const escuro = { ...claro, ...lerTokens(css.slice(inicioEscuro, css.indexOf('@layer base'))) }

const paraSrgb = ([L, C, h]) => {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return lin
    .map((v) => Math.min(1, Math.max(0, v)))
    .map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055))
}
/** Cor do token (com a própria transparência e uma opacidade extra, como `bg-x/10`) sobre um fundo. */
const sobre = (tokens, nome, fundo, opacidade = 1) => {
  const t = tokens[nome]
  const alfa = t.alfa * opacidade
  const f = paraSrgb(tokens[fundo].lch)
  return paraSrgb(t.lch).map((v, i) => v * alfa + f[i] * (1 - alfa))
}
const lum = (rgb) => {
  const [r, g, b] = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const razao = (x, y) => {
  const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p)
  return (a + 0.05) / (b + 0.05)
}

const falhas = []
const conferir = (tema, tokens, texto, fundo, minimo, tinta) => {
  const bg = tinta ? sobre(tokens, tinta.cor, fundo, tinta.opacidade) : sobre(tokens, fundo, fundo)
  const r = razao(sobre(tokens, texto, fundo), bg)
  const rotulo = `${tema}: ${texto} sobre ${tinta ? `${tinta.cor}/${tinta.opacidade * 100} em ` : ''}${fundo}`
  console.log(
    `${r >= minimo ? 'ok   ' : 'FALHA'} ${r.toFixed(2).padStart(5)}:1 (mín. ${minimo}) ${rotulo}`,
  )
  if (r < minimo) falhas.push(rotulo)
}

for (const [tema, t, tinta, fundoTinta] of [
  ['claro', claro, 0.1, 'background'],
  ['escuro', escuro, 0.2, 'card'],
]) {
  conferir(tema, t, 'foreground', 'background', 4.5)
  conferir(tema, t, 'primary-foreground', 'primary', 4.5)
  conferir(tema, t, 'muted-foreground', 'background', 4.5)
  conferir(tema, t, 'muted-foreground', 'muted', 4.5)
  conferir(tema, t, 'input', 'background', 3)
  conferir(tema, t, 'ring', 'background', 3)
  for (const cor of ['destructive', 'success', 'warning']) {
    conferir(tema, t, cor, fundoTinta, 4.5, { cor, opacidade: tinta })
  }
}

if (falhas.length) {
  console.error(`\n${falhas.length} par(es) abaixo do mínimo (12 UI-02/03).`)
  process.exit(1)
}
