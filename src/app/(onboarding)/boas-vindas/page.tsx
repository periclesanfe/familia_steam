import type { Metadata } from 'next'
import Link from 'next/link'

import { CabecalhoPagina } from '@/components/CabecalhoPagina'
import { FormAcao } from '@/components/FormAcao'
import { Markdown } from '@/components/Markdown'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { declaracaoDeAdesao } from '@/domain/regulamento'
import { sairAcao } from '@/features/autenticacao/acoes'
import { FormAssinatura } from '@/features/onboarding/componentes/FormAssinatura'
import { FormDados } from '@/features/onboarding/componentes/FormDados'
import { estadoDoOnboarding } from '@/features/onboarding/consultas'
import { TabelaAnexoI } from '@/features/regulamento/componentes/TabelaAnexoI'
import { formatarDataCivil, formatarDataHora } from '@/lib/formato'
import { paginaExige } from '@/server/auth/guardas'
import { agora } from '@/server/relogio'

export const metadata: Metadata = { title: 'Boas-vindas' }

// 07 §3.2 / RN-ACE-06: completar cadastro e assinar o Regulamento.
export default async function BoasVindasPage() {
  // MEMBRO também: a última assinatura ativa o fundador e esta tela mostra a conclusão
  const { pessoaId, perfil } = await paginaExige(['PENDENTE', 'MEMBRO'])
  const e = await estadoDoOnboarding(pessoaId, agora())

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
      <CabecalhoPagina
        titulo={`Boas-vindas, ${e.pessoa.apelido}`}
        descricao="Complete seu cadastro e assine o Regulamento para participar do consórcio."
        acoes={
          <FormAcao acao={sairAcao}>
            <Button type="submit" variant="ghost">
              Sair
            </Button>
          </FormAcao>
        }
      />

      {e.assinadaEm && (
        <Alert>
          <AlertTitle>Você assinou em {formatarDataHora(e.assinadaEm)}.</AlertTitle>
          <AlertDescription>
            {e.inicioDoCiclo1
              ? `O Regulamento está em vigor. O ciclo 1 começa em ${formatarDataCivil(e.inicioDoCiclo1)}.`
              : `Aguardando os demais fundadores (${String(e.progresso?.assinaram ?? 0)}/${String(e.progresso?.total ?? 0)}).`}
          </AlertDescription>
          {perfil === 'MEMBRO' && (
            <Link href="/" className="mt-2 text-sm font-medium underline underline-offset-4">
              Ir para o painel
            </Link>
          )}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>1. Conta Steam</CardTitle>
          <CardDescription>
            Vem do seu login e não pode ser trocada por aqui (RN-ACE-16).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <div className="text-muted-foreground">Código de amigo</div>
            <div className="font-mono">{e.pessoa.codigoAmigo ?? '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">SteamID64</div>
            <div className="font-mono">{e.pessoa.steamId64 ?? '—'}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Seus dados</CardTitle>
        </CardHeader>
        <CardContent>
          <FormDados
            valores={{
              nome: e.pessoa.nome,
              apelido: e.pessoa.apelido,
              chavePix: e.pessoa.chavePix,
              tipoChavePix: e.pessoa.tipoChavePix,
              maioridadeDeclarada: Boolean(e.pessoa.maioridadeDeclaradaEm),
            }}
          />
        </CardContent>
      </Card>

      {e.versao && (
        <Card>
          <CardHeader>
            <CardTitle>3. Regulamento, versão {e.versao.numero}</CardTitle>
            <CardDescription>
              sha256 <span className="font-mono break-all">{e.versao.sha256}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div
              className="max-h-[60vh] overflow-y-auto rounded-lg border p-4"
              tabIndex={0}
              aria-label="Texto do Regulamento"
            >
              <Markdown texto={e.versao.textoMarkdown} />
            </div>
            <h3 className="text-base font-medium">Anexo I vigente</h3>
            <TabelaAnexoI entradas={e.bloqueados} />
          </CardContent>
        </Card>
      )}

      {e.versao && !e.assinadaEm && (
        <Card>
          <CardHeader>
            <CardTitle>4. Assinatura</CardTitle>
            {!e.pessoa.cadastroCompleto && (
              <CardDescription>Salve seus dados antes de assinar.</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <FormAssinatura
              declaracao={declaracaoDeAdesao(e.versao.numero)}
              numero={e.versao.numero}
              habilitado={e.pessoa.cadastroCompleto}
            />
          </CardContent>
        </Card>
      )}
    </main>
  )
}
