import { expect, test } from '@playwright/test'

// Depende do estado deixado por onboarding.spec.ts (1.0 vigente, ciclo 1 com a rodada 1 agendada):
// o Playwright roda os arquivos em ordem alfabética com 1 worker (playwright.config.ts).
test('rodada 1: não concorrer, voltar a concorrer e justificar antecipadamente', async ({
  page,
}) => {
  await page.goto('/api/auth/dev?steamId64=76561197960287931') // Bruno
  await page.getByRole('link', { name: 'Rodadas' }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Rodadas do ciclo 1/)
  await page.getByRole('link', { name: /Rodada 1/ }).click()
  await expect(page.getByText(/Sorteio em \d{2}\/\d{2}\/\d{4}/)).toBeVisible()

  await page.getByRole('button', { name: 'Não vou concorrer' }).click()
  await expect(page.getByRole('button', { name: 'Voltar a concorrer' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: '(você)' })).toContainText(
    'Optou por não concorrer',
  )

  await page.getByRole('button', { name: 'Voltar a concorrer' }).click()
  await expect(page.getByRole('button', { name: 'Não vou concorrer' })).toBeVisible()

  await page.getByLabel('Justificativa antecipada').fill('O salário cai só no dia 5.')
  await page.getByRole('button', { name: 'Justificar' }).click()
  await expect(
    page.getByText('Sua justificativa antecipada: “O salário cai só no dia 5.”'),
  ).toBeVisible()
  // antes do horário não há botão de sorteio (RN-SOR-02)
  await expect(page.getByRole('button', { name: 'Realizar sorteio' })).toHaveCount(0)
})
