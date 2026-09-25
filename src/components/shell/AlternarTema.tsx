'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type Tema = 'claro' | 'escuro' | 'sistema'

/** 12 UI-04 (rev. M10): a escolha vai para um cookie lido no layout raiz (sem flash na carga). */
export function AlternarTema({ inicial }: { inicial: Tema }) {
  const [tema, setTema] = useState<Tema>(inicial)
  const escolher = (valor: string) => {
    const novo = valor as Tema
    setTema(novo)
    document.cookie = `tema=${novo}; path=/; max-age=31536000; samesite=lax`
    const html = document.documentElement
    html.classList.toggle('dark', novo === 'escuro')
    html.classList.toggle('light', novo === 'claro')
  }
  const Icone = tema === 'escuro' ? Moon : tema === 'claro' ? Sun : Monitor
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Tema de cores">
          <Icone />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={tema} onValueChange={escolher}>
          <DropdownMenuRadioItem value="claro">
            <Sun /> Claro
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="escuro">
            <Moon /> Escuro
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="sistema">
            <Monitor /> Do sistema
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
