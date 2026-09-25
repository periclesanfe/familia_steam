import { expect, test } from '@playwright/test'

test('página inicial responde em pt-BR', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Família Steam')
})
