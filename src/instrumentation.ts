// Roda uma vez por instância, no boot do servidor: falha cedo se o ambiente estiver inválido.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { env } = await import('./server/env')
    env()
  }
}
