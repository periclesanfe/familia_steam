'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** 07 §1 / 12 UI-16: "tempo real" sem websocket — refresh a cada N s, só com a aba visível. */
export function AtualizarPeriodicamente({ segundos = 15 }: { segundos?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) router.refresh()
    }, segundos * 1000)
    return () => {
      clearInterval(id)
    }
  }, [router, segundos])
  return null
}
