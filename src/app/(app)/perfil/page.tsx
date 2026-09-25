import type { Metadata } from 'next'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { FormAcao } from '@/components/FormAcao'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { sairDeTodosAcao } from '@/features/autenticacao/acoes'
import { FormDados } from '@/features/onboarding/componentes/FormDados'
import { meuPerfil } from '@/features/perfil/consultas'
import { formatarDataHora } from '@/lib/formato'
import { paginaExige } from '@/server/auth/guardas'
import { obterSessao } from '@/server/auth/sessao'
import { agora } from '@/server/relogio'

export const metadata: Metadata = { title: 'Perfil' }

// 07 §3.14: dados, chave Pix e sessões (a zona de declarações entra no M8a).
export default async function PerfilPage() {
  const { pessoaId, perfil } = await paginaExige(['MEMBRO', 'EX_COM_PENDENCIA', 'EX_QUITADO'])
  const [{ pessoa, sessoes }, sessao] = await Promise.all([
    meuPerfil(pessoaId, agora()),
    obterSessao(),
  ])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo="Perfil"
        descricao={`${pessoa.apelido} · SteamID64 ${pessoa.steamId64 ?? '—'}`}
      />
      {perfil === 'MEMBRO' && (
        <Card>
          <CardHeader>
            <CardTitle>Dados e chave Pix</CardTitle>
            <CardDescription>
              A troca da chave fica registrada na auditoria, mascarada (RN-CAD-05).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormDados
              valores={{
                nome: pessoa.nome,
                apelido: pessoa.apelido,
                chavePix: pessoa.chavePix,
                tipoChavePix: pessoa.tipoChavePix,
                maioridadeDeclarada: Boolean(pessoa.maioridadeDeclaradaEm),
              }}
            />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Sessões ativas</CardTitle>
          <CardDescription>Cada sessão vale 30 dias a partir do login.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {sessoes.map((s) => (
              <li key={s.id} className="flex flex-col gap-0.5 px-3 py-2">
                <span className="font-medium">
                  {s.userAgent?.slice(0, 80) ?? 'Navegador desconhecido'}
                  {s.id === sessao?.sessaoId && (
                    <span className="text-muted-foreground"> (esta)</span>
                  )}
                </span>
                <span className="text-muted-foreground">
                  Entrou em {formatarDataHora(s.criadaEm)} · expira em{' '}
                  {formatarDataHora(s.expiraEm)}
                </span>
              </li>
            ))}
          </ul>
          <FormAcao acao={sairDeTodosAcao}>
            <Button type="submit" variant="outline">
              Sair de todos os dispositivos
            </Button>
          </FormAcao>
        </CardContent>
      </Card>
    </div>
  )
}
