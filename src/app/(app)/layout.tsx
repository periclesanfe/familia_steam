import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { BarraLateral } from '@/components/shell/BarraLateral'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { perfilDe } from '@/server/auth/perfil'
import { obterSessao } from '@/server/auth/sessao'
import { db } from '@/server/db'

// 07 §1: o guard do layout só redireciona; cada página e cada action refazem a autorização.
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const sessao = await obterSessao()
  if (!sessao) redirect('/entrar')
  const [perfil, pessoa, jar] = await Promise.all([
    perfilDe(sessao.pessoaId),
    db.pessoa.findUniqueOrThrow({ where: { id: sessao.pessoaId }, select: { apelido: true } }),
    cookies(),
  ])
  if (perfil?.perfil === 'PENDENTE') redirect('/boas-vindas')

  return (
    <SidebarProvider defaultOpen={jar.get('sidebar_state')?.value !== 'false'}>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
      >
        Pular para o conteúdo
      </a>
      <BarraLateral apelido={pessoa.apelido} />
      <SidebarInset id="conteudo">
        <header className="flex h-12 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger />
          <span className="text-sm font-semibold">Família Steam</span>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t px-4 py-3 text-xs text-muted-foreground md:px-6">
          Horários de Brasília.
        </footer>
      </SidebarInset>
    </SidebarProvider>
  )
}
