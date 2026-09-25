import 'server-only'

import { forbidden, redirect } from 'next/navigation'

import { ErroDeNegocio } from '@/domain/erros'

import { entrarNaFamilia } from '../familia'
import { type Perfil, type PerfilAtual, perfilDe } from './perfil'
import { obterSessao } from './sessao'

export const TODOS_OS_PERFIS: readonly Perfil[] = [
  'VISITANTE',
  'PENDENTE',
  'MEMBRO',
  'EX_COM_PENDENCIA',
  'EX_QUITADO',
]

/** RN-ACE-03, para serviços e actions: nega por padrão com ErroDeNegocio. */
export async function exigirPerfil(
  pessoaId: string,
  perfis: readonly Perfil[],
): Promise<PerfilAtual> {
  const p = await perfilDe(pessoaId)
  if (!p || !perfis.includes(p.perfil)) throw new ErroDeNegocio('SEM_PERMISSAO')
  entrarNaFamilia(p.familiaId)
  return p
}

/**
 * RN-ACE-03, para páginas: sem sessão → /entrar; PENDENTE fora do onboarding → /boas-vindas;
 * outro perfil sem acesso → 403. O layout só redireciona; cada página chama de novo.
 */
export async function paginaExige(perfis: readonly Perfil[]): Promise<PerfilAtual> {
  const sessao = await obterSessao()
  if (!sessao) redirect('/entrar')
  const p = await perfilDe(sessao.pessoaId)
  if (!p) redirect('/entrar?erro=nao_autorizado')
  // 15 §4: o restante da página consulta dentro da família da pessoa (RLS)
  entrarNaFamilia(p.familiaId)
  if (perfis.includes(p.perfil)) return p
  if (p.perfil === 'PENDENTE') redirect('/boas-vindas')
  if (p.perfil === 'VISITANTE') redirect('/inicio')
  forbidden()
}
