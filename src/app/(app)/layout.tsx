import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { AlternarTema, type Tema } from '@/components/shell/AlternarTema'
import { BarraLateral } from '@/components/shell/BarraLateral'
import { MenuUsuario } from '@/components/shell/MenuUsuario'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { familiaDe } from '@/features/familias/consultas'
import { perfilDe } from '@/server/auth/perfil'
import { obterSessao } from '@/server/auth/sessao'
import { dbBase } from '@/server/db'

const SUBTITULO = {
  VISITANTE: 'Sem família',
  PENDENTE: 'Entrando no acordo',
  MEMBRO: 'Membro',
  EX_COM_PENDENCIA: 'Ex-membro com pendências',
  EX_QUITADO: 'Ex-membro',
} as const

// 07 §1 / 12 UI-09 (rev. M10): barra lateral por perfil + cabeçalho com tema e conta. O guard do
// layout só redireciona sem sessão; cada página e cada action refazem a autorização.
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const sessao = await obterSessao()
  if (!sessao) redirect('/entrar')
  const [perfil, pessoa, familia, jar] = await Promise.all([
    perfilDe(sessao.pessoaId),
    dbBase.pessoa.findUniqueOrThrow({
      where: { id: sessao.pessoaId },
      select: { apelido: true, steamNick: true, steamAvatarUrl: true },
    }),
    familiaDe(sessao.pessoaId),
    cookies(),
  ])
  if (!perfil) redirect('/entrar')
  const tema = (jar.get('tema')?.value ?? 'sistema') as Tema
  const nome = pessoa.steamNick ?? pessoa.apelido

  return (
    <SidebarProvider defaultOpen={jar.get('sidebar_state')?.value !== 'false'}>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
      >
        Pular para o conteúdo
      </a>
      <BarraLateral
        perfil={perfil.perfil}
        familia={perfil.perfil === 'VISITANTE' ? null : familia}
      />
      <SidebarInset id="conteudo">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-4">
          <SidebarTrigger />
          <span aria-hidden className="mx-1 h-5 w-px bg-border" />
          <span className="truncate text-sm font-medium text-muted-foreground">
            {perfil.perfil === 'VISITANTE' ? 'Área pessoal' : (familia ?? 'Família Steam')}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <AlternarTema inicial={tema} />
            <MenuUsuario
              nome={nome}
              avatarUrl={pessoa.steamAvatarUrl}
              subtitulo={SUBTITULO[perfil.perfil]}
              membro={perfil.perfil === 'MEMBRO'}
            />
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t px-4 py-3 text-xs text-muted-foreground md:px-6">
          Horários de Brasília · Família Steam não é afiliada à Valve Corporation.
        </footer>
      </SidebarInset>
    </SidebarProvider>
  )
}
