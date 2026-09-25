// C-TEMPO: único ponto de leitura do relógio no servidor. Testes controlam com vi.setSystemTime.
export const agora = (): Date => new Date()
