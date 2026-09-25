import { expect, test } from '@playwright/test'

// Depende do estado de onboarding.spec.ts (1.0 vigente; 5 membros ativos): ordem alfabética, 1 worker.
const MALICIOSO = 'Veja <img src=x onerror="window.__xss=1"> e [clique](javascript:window.__xss=2)'
const FUNDADORES = ['76561197960287930', '76561197960287931', '76561197960287932']

test('CA-124: votação com justificativa maliciosa → texto na tela e na ATA, sem executar', async ({
  browser,
}) => {
  let votacaoUrl = ''
  for (const [i, steamId64] of FUNDADORES.entries()) {
    const contexto = await browser.newContext()
    const page = await contexto.newPage()
    page.on('dialog', () => {
      throw new Error('diálogo inesperado (XSS?)')
    })
    await page.goto(`/api/auth/dev?steamId64=${steamId64}`)
    if (i === 0) {
      await page.goto('/votacoes/nova?assunto=OUTRO')
      await page.getByLabel('Proposição').fill('Registrar que o grupo prefere jogos cooperativos')
      await page.getByLabel('Justificativa').fill(MALICIOSO)
      await page.getByRole('button', { name: 'Convocar votação' }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: 'Convocar votação' }).click()
      await expect(page).toHaveURL(/\/votacoes\/[0-9a-f-]{36}$/)
      votacaoUrl = page.url()
      await expect(page.getByText(MALICIOSO, { exact: false })).toBeVisible()
    } else {
      await page.goto(votacaoUrl)
    }
    await page.getByRole('button', { name: 'Votar a favor' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Votar a favor' }).click()
    await expect(
      page.getByText('Seu voto está registrado.').or(page.getByRole('link', { name: /Ver a ATA/ })),
    ).toBeVisible()
    await contexto.close()
  }

  const contexto = await browser.newContext()
  const page = await contexto.newPage()
  await page.goto(`/api/auth/dev?steamId64=${FUNDADORES[0] ?? ''}`)
  await page.goto(votacaoUrl)
  await page.getByRole('link', { name: /Ver a ATA/ }).click()
  await expect(page.getByText('(x) Aprovado')).toBeVisible()
  expect(await page.locator('img[src="x"]').count()).toBe(0)
  expect(await page.locator('a[href^="javascript:"]').count()).toBe(0)
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  await contexto.close()
})
