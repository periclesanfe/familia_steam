import { expect, test } from '@playwright/test'

test('sem sessão, a raiz leva ao login em pt-BR', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/entrar$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Família Steam')
  await expect(page.getByRole('img', { name: 'Entrar com Steam' })).toBeVisible()
})

test('erro de login aparece com texto neutro', async ({ page }) => {
  await page.goto('/entrar?erro=nao_autorizado')
  await expect(page.getByText('Esta conta Steam não está autorizada.')).toBeVisible()
})
