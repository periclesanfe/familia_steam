import { execFileSync } from 'node:child_process'

import { expect, type Page, test } from '@playwright/test'

import { URLS_TESTE } from './urls'

// 15 §5/§6: páginas do M10 renderizadas com sessão, sem erro no navegador.
// Depende do estado de onboarding.spec.ts (1.0 vigente; 5 fundadores).
const ANA = '76561197960287930'
const VISITANTE = '76561197960287999'

function ajustarBiblioteca() {
  execFileSync(
    './node_modules/.bin/tsx',
    ['--conditions=react-server', 'tests/e2e/ajustar.ts', 'biblioteca'],
    { env: { ...process.env, MIGRATE_DATABASE_URL: URLS_TESTE.dono }, encoding: 'utf8' },
  )
}

/** Falha o teste se a página lançar erro no navegador (hidratação, componente cliente). */
function vigiarErros(page: Page): string[] {
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(e.message))
  return erros
}

/** Próximo dia 3 (a partir de amanhã), em AAAA-MM-DD no fuso de Brasília. */
function proximoSorteio(): string {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(),
  )
  const [a = 0, m = 1, d = 1] = hoje.split('-').map(Number)
  const [ano, mes] = d < 3 ? [a, m] : m === 12 ? [a + 1, 1] : [a, m + 1]
  return `${String(ano)}-${String(mes).padStart(2, '0')}-03`
}

test('membro: biblioteca em grade, página do jogo e calendário de promoções', async ({ page }) => {
  const erros = vigiarErros(page)
  ajustarBiblioteca()
  await page.goto(`/api/auth/dev?steamId64=${ANA}`)

  await page.goto('/familia')
  await expect(page.getByRole('heading', { name: 'Biblioteca da família' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Stardew Valley/ })).toBeVisible()
  await page.getByLabel('Buscar jogo').fill('nenhum jogo com esse nome')
  await expect(page.getByText('Nada com esses filtros.')).toBeVisible()

  await page.goto('/jogos/413150')
  await expect(page.getByRole('heading', { level: 1, name: 'Stardew Valley' })).toBeVisible()
  await expect(page.getByText('Extremamente positivas')).toBeVisible()
  await expect(page.getByText('98% de 1.000')).toBeVisible()
  await expect(page.getByText('36.230')).toBeVisible()
  const segunda = page.getByRole('button', { name: 'Ver captura 2' })
  await segunda.click()
  await expect(segunda).toHaveAttribute('aria-pressed', 'true')

  await page.goto('/promocoes')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Calendário de promoções' }),
  ).toBeVisible()
  const sorteio = proximoSorteio()
  await page.getByLabel('Nome').fill('Promoção de teste E2E')
  await page.getByLabel('Início').fill(sorteio)
  await page.getByLabel('Fim').fill(sorteio)
  await page.getByLabel('Link da fonte').fill('https://store.steampowered.com/news/')
  await page.getByRole('button', { name: 'Cadastrar' }).click()
  await expect(page.getByText('Promoção cadastrada', { exact: true })).toBeVisible()
  await expect(page.getByText('Bom momento').first()).toBeVisible()
  await expect(page.getByText('Na lista de', { exact: false })).toBeVisible() // Stardew com -50%
  await page.getByRole('button', { name: 'Remover Promoção de teste E2E' }).click()
  await expect(page.getByText('Evento removido', { exact: true })).toBeVisible() // o botão some junto com o item

  expect(erros).toEqual([])
})

test('visitante: vê promoções e jogos, mas não a família nem o formulário', async ({ page }) => {
  const erros = vigiarErros(page)
  await page.goto(`/api/auth/dev?steamId64=${VISITANTE}`)

  await page.goto('/promocoes')
  await expect(
    page.getByText('Os sorteios aparecem quando você estiver numa família.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cadastrar' })).toHaveCount(0)

  await page.goto('/jogos/413150')
  await expect(page.getByRole('heading', { level: 1, name: 'Stardew Valley' })).toBeVisible()

  await page.goto('/familia')
  await expect(page).toHaveURL(/\/inicio$/)

  expect(erros).toEqual([])
})
