import { useSyncExternalStore } from 'react'

const MOBILE_BREAKPOINT = 768
const consulta = `(max-width: ${String(MOBILE_BREAKPOINT - 1)}px)`

const assinar = (avisar: () => void) => {
  const mql = window.matchMedia(consulta)
  mql.addEventListener('change', avisar)
  return () => {
    mql.removeEventListener('change', avisar)
  }
}

// Sem setState em efeito: o navegador é a fonte (no servidor, desktop).
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(consulta).matches,
    () => false,
  )
}
