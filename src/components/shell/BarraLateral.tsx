'use client'

import {
  BookOpen,
  CalendarDays,
  Dices,
  FileSignature,
  Heart,
  House,
  LayoutDashboard,
  ScrollText,
  UserRound,
  UsersRound,
  Vote,
  Wallet,
} from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

type Perfil = 'VISITANTE' | 'PENDENTE' | 'MEMBRO' | 'EX_COM_PENDENCIA' | 'EX_QUITADO'
type Item = { href: Route; rotulo: string; Icone: typeof House }
type Grupo = { titulo: string; itens: Item[] }

/** 07 §2 / 12 UI-09 (rev. M10): o menu acompanha o perfil (15 RN-FAM-01). */
function grupos(perfil: Perfil): Grupo[] {
  const pessoal: Grupo = {
    titulo: 'Você',
    itens: [
      { href: '/inicio', rotulo: 'Início', Icone: House },
      { href: '/lista-de-desejos', rotulo: 'Lista de desejos', Icone: Heart },
      { href: '/promocoes', rotulo: 'Promoções', Icone: CalendarDays },
    ],
  }
  if (perfil === 'VISITANTE') return [pessoal]
  if (perfil === 'PENDENTE') {
    pessoal.itens.push({ href: '/boas-vindas', rotulo: 'Entrar no acordo', Icone: FileSignature })
    return [pessoal]
  }
  pessoal.itens.push({ href: '/perfil', rotulo: 'Perfil', Icone: UserRound })
  if (perfil !== 'MEMBRO') {
    return [
      pessoal,
      {
        titulo: 'Consórcio',
        itens: [
          { href: '/', rotulo: 'Painel', Icone: LayoutDashboard },
          { href: '/financeiro', rotulo: 'Financeiro', Icone: Wallet },
        ],
      },
    ]
  }
  return [
    {
      titulo: 'Consórcio',
      itens: [
        { href: '/', rotulo: 'Painel', Icone: LayoutDashboard },
        { href: '/rodadas', rotulo: 'Rodadas', Icone: Dices },
        { href: '/financeiro', rotulo: 'Financeiro', Icone: Wallet },
        { href: '/votacoes', rotulo: 'Votações', Icone: Vote },
      ],
    },
    {
      titulo: 'Família',
      itens: [
        { href: '/familia', rotulo: 'Família & jogos', Icone: UsersRound },
        { href: '/regulamento', rotulo: 'Regulamento', Icone: BookOpen },
        { href: '/auditoria', rotulo: 'Auditoria', Icone: ScrollText },
      ],
    },
    pessoal,
  ]
}

export function BarraLateral({ perfil, familia }: { perfil: Perfil; familia: string | null }) {
  const caminho = usePathname()
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link href="/inicio" className="flex items-center gap-2 rounded-md px-1 py-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- ícone SVG do próprio app */}
          <img src="/icon.svg" alt="" className="size-8 shrink-0" />
          <span className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold">Família Steam</span>
            <span className="truncate text-xs text-muted-foreground">
              {familia ?? 'Sem família'}
            </span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {grupos(perfil).map((g) => (
          <SidebarGroup key={g.titulo}>
            <SidebarGroupLabel>{g.titulo}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.itens.map(({ href, rotulo, Icone }) => {
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
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
