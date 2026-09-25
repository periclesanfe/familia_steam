import { expect, test } from '@playwright/test'

const FUNDADORES = [
  ['Ana', '76561197960287930'],
  ['Bruno', '76561197960287931'],
  ['Caio', '76561197960287932'],
  ['Duda', '76561197960287933'],
  ['Edu', '76561197960287934'],
] as const

// CA-112: os 5 fundadores fazem onboarding e assinam → vigência → ciclo 1 planejado em 03/MM.
test('onboarding dos 5 fundadores põe o Regulamento em vigor', async ({ browser }) => {
  for (const [i, [apelido, steamId64]] of FUNDADORES.entries()) {
    const contexto = await browser.newContext()
    const pagina = await contexto.newPage()
    await pagina.goto(`/api/auth/dev?steamId64=${steamId64}`)
    await expect(pagina).toHaveURL(/\/boas-vindas$/)
    await expect(pagina.getByRole('heading', { level: 1 })).toHaveText(`Boas-vindas, ${apelido}`)

    await pagina
      .getByLabel('Chave Pix', { exact: true })
      .fill(`123e4567-e89b-12d3-a456-42661417400${String(i)}`)
    await pagina.getByRole('checkbox', { name: /maior de idade/ }).check()
    await pagina.getByRole('button', { name: 'Salvar dados' }).click()
    await expect(pagina.getByText('Dados salvos')).toBeVisible()

    await pagina.getByRole('checkbox', { name: /Declaro que li e concordo/ }).check()
    await pagina.getByRole('checkbox', { name: /outra conta Steam/ }).check()
    await pagina.getByRole('button', { name: 'Assinar o Regulamento' }).click()
    await pagina
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Assinar o Regulamento' })
      .click()
    await expect(pagina.getByText(/Você assinou em/)).toBeVisible()

    if (i < FUNDADORES.length - 1) {
      await expect(
        pagina.getByText(`Aguardando os demais fundadores (${String(i + 1)}/5).`),
      ).toBeVisible()
    } else {
      await expect(pagina.getByText(/O ciclo 1 começa em 03\/\d{2}\/\d{4}/)).toBeVisible()
      await pagina.getByRole('link', { name: 'Ir para o painel' }).click()
      await expect(pagina).toHaveURL(/\/$/)
    }
    await contexto.close()
  }

  // já MEMBRO: o painel e o Regulamento vigente abrem
  const contexto = await browser.newContext()
  const pagina = await contexto.newPage()
  await pagina.goto(`/api/auth/dev?steamId64=${FUNDADORES[0][1]}`)
  await expect(pagina).toHaveURL(/\/$/)
  await pagina.getByRole('link', { name: 'Regulamento' }).first().click()
  await expect(pagina.getByText(/Em vigor desde/)).toBeVisible()
  await expect(pagina.locator('#art-23')).toBeAttached()
  await contexto.close()
})
