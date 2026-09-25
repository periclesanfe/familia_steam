import { execFileSync } from 'node:child_process'

import { type Browser, expect, type Page, test } from '@playwright/test'

import { CRON_SECRET_E2E, URLS_TESTE } from './urls'

// CA-113, ponta a ponta: sorteio pelo tick → 4 Pix com comprovante → confirmações → aviso → +48 h
// (simulado) → compra → aquisição concluída → SOBRA para o mês seguinte.
// Roda por último (ordem alfabética, 1 worker), sobre o estado deixado pelos anteriores.
const FUNDADORES = [
  '76561197960287930',
  '76561197960287931',
  '76561197960287932',
  '76561197960287933',
  '76561197960287934',
]
const JPEG = { name: 'c.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 1]) }

type Ajuste = {
  rodadaId?: string
  status?: string
  contemplado?: string
  sobraCentavos?: number
  executadaEm?: number
}

function ajustar(acao: string): Ajuste {
  const saida = execFileSync(
    './node_modules/.bin/tsx',
    ['--conditions=react-server', 'tests/e2e/ajustar.ts', acao],
    { env: { ...process.env, MIGRATE_DATABASE_URL: URLS_TESTE.dono }, encoding: 'utf8' },
  )
  return JSON.parse(saida) as Ajuste
}

/** "AAAA-MM-DDTHH:MM" no horário de Brasília, para os campos datetime-local. */
const campoLocal = (t: Date) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(t)
    .replace(' ', 'T')

async function entrar(browser: Browser, steamId64: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto(`/api/auth/dev?steamId64=${steamId64}`)
  return page
}

// o teste altera o estado ao avançar: repetir do zero não faz sentido
test.describe.configure({ retries: 0 })

test('CA-113: um mês completo', async ({ browser, request }) => {
  test.setTimeout(180_000)
  const rodadaId = ajustar('sorteio-vencido').rodadaId ?? ''
  const tick = await request.get('/api/cron/tick', {
    headers: { Authorization: `Bearer ${CRON_SECRET_E2E}` },
  })
  expect(tick.ok()).toBe(true)
  const { status, contemplado = '' } = ajustar('rodada')
  expect(status).toBe('CONTEMPLADA')
  const pagantes = FUNDADORES.filter((s) => s !== contemplado)

  // 4 pagamentos com comprovante (DECLARADO)
  for (const steam of pagantes) {
    const page = await entrar(browser, steam)
    await page.goto(`/rodadas/${rodadaId}?aba=pagamentos`)
    const form = page
      .locator('details')
      .filter({ has: page.locator('summary', { hasText: /^Paguei/ }) })
    await form.locator('summary').click()
    await form.getByLabel('Data e hora do Pix').fill(campoLocal(new Date(Date.now() - 60_000)))
    await form.getByLabel('Comprovante').setInputFiles(JPEG)
    await form.locator('form').getByRole('button', { name: 'Registrar pagamento' }).click()
    await expect(form).toHaveCount(0) // quitada: o formulário sai da tela
    await page.context().close()
  }

  // confirmações pelo contemplado (recebedor)
  const c = await entrar(browser, contemplado)
  await c.goto(`/rodadas/${rodadaId}?aba=pagamentos`)
  for (let i = 0; i < pagantes.length; i++) {
    const botoes = c.getByRole('button', { name: 'Confirmar', exact: true })
    await expect(botoes).toHaveCount(pagantes.length - i)
    await botoes.first().click()
    await expect(botoes).toHaveCount(pagantes.length - i - 1)
  }

  // aviso do jogo
  ajustar('loja')
  await c.goto(`/rodadas/${rodadaId}?aba=jogo`)
  await c.locator('#app').fill('1145350')
  await c.locator('#nome').fill('Hades II')
  await c.getByLabel(/Não é jogo de conteúdo pornográfico/).click()
  await c.getByRole('button', { name: 'Avisar o jogo' }).click()
  await expect(c.getByText('Avisar outro jogo')).toBeVisible()

  // +48 h sem veto → compra autorizada
  ajustar('janela-vencida')
  await c.reload()
  await c.getByText('Registrar compra', { exact: true }).first().click()
  await c.locator('#c-app').fill('1145350')
  await c.locator('#c-nome').fill('Hades II')
  // a compra precisa ser depois do sorteio (CA-69) e no passado; o campo tem precisão de minuto
  const sorteioEm = ajustar('rodada').executadaEm ?? 0
  const espera = sorteioEm + 61_000 - Date.now()
  if (espera > 0) await c.waitForTimeout(espera)
  await c.locator('#c-compradaEm').fill(campoLocal(new Date()))
  await c.locator('#c-valor').fill('89,90')
  await c.locator('#c-arquivo').setInputFiles(JPEG)
  await c
    .locator('form')
    .filter({ has: c.locator('#c-app') })
    .getByRole('button', { name: 'Registrar compra' })
    .click()

  // aquisição concluída → rodada fechada com SOBRA de 12500 − 8990
  const concluir = c.getByRole('button', { name: 'Aquisição concluída' }).first()
  await concluir.waitFor({ timeout: 15_000 }).catch(async (e: unknown) => {
    // diagnóstico no CI: mostra o erro de negócio do formulário da compra
    console.log('alertas:', await c.getByRole('alert').allTextContents())
    throw e
  })
  await concluir.click()
  await c.getByRole('alertdialog').getByRole('button', { name: 'Aquisição concluída' }).click()
  await expect
    .poll(() => ajustar('rodada'))
    .toMatchObject({ status: 'FECHADA', sobraCentavos: 3510 })
})
