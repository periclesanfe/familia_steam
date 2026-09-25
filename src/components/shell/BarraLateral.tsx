'use client'

import { BookOpen, Dices, LayoutDashboard, LogOut, UserRound, Vote, Wallet } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { FormAcao } from '@/components/FormAcao'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { sairAcao } from '@/features/autenticacao/acoes'

// 07 §2 / 12 UI-09: itens entram conforme as rotas existem (typedRoutes).
const ITENS = [
  { href: '/', rotulo: 'Painel', Icone: LayoutDashboard },
  { href: '/rodadas', rotulo: 'Rodadas', Icone: Dices },
  { href: '/financeiro', rotulo: 'Financeiro', Icone: Wallet },
  { href: '/votacoes', rotulo: 'Votações', Icone: Vote },
  { href: '/regulamento', rotulo: 'Regulamento', Icone: BookOpen },
  { href: '/perfil', rotulo: 'Perfil', Icone: UserRound },
] as const

export function BarraLateral({ apelido }: { apelido: string }) {
  const caminho = usePathname()
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <span className="px-2 py-1 text-sm font-semibold group-data-[collapsible=icon]:hidden">
          Família Steam
        </span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {ITENS.map(({ href, rotulo, Icone }) => {
                const ativo = href === '/' ? caminho === '/' : caminho.startsWith(href)
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={ativo} tooltip={rotulo}>
                      <Link href={href} aria-current={ativo ? 'page' : undefined}>
                        <Icone />
                        <span>{rotulo}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <FormAcao acao={sairAcao}>
              <SidebarMenuButton type="submit" tooltip="Sair">
                <LogOut />
                <span>Sair ({apelido})</span>
              </SidebarMenuButton>
            </FormAcao>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
