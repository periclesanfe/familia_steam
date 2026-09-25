'use client'

import { House, LogOut, UserRound } from 'lucide-react'
import Link from 'next/link'

import { FormAcao } from '@/components/FormAcao'
import { PessoaAvatar } from '@/components/PessoaAvatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { sairAcao } from '@/features/autenticacao/acoes'

// 12 UI-09 (rev. M10): conta, atalhos e saída no canto do cabeçalho.
export function MenuUsuario({
  nome,
  avatarUrl,
  subtitulo,
  membro,
}: {
  nome: string
  avatarUrl: string | null
  subtitulo: string
  membro: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5" aria-label="Sua conta">
          <PessoaAvatar apelido={nome} url={avatarUrl} />
          <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">{nome}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">{nome}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{subtitulo}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/inicio">
            <House /> Início
          </Link>
        </DropdownMenuItem>
        {membro && (
          <DropdownMenuItem asChild>
            <Link href="/perfil">
              <UserRound /> Perfil e dados
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <FormAcao acao={sairAcao}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut /> Sair
            </button>
          </DropdownMenuItem>
        </FormAcao>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
