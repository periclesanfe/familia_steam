'use client'

import { Search } from 'lucide-react'
import { useDeferredValue, useState } from 'react'

import { BotaoEnviar } from '@/components/BotaoEnviar'
import { FormAcao } from '@/components/FormAcao'
import { PessoaAvatar } from '@/components/PessoaAvatar'
import { StatusBadge } from '@/components/StatusBadge'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { indicarAcao } from '@/features/familias/acoes'

type Amigo = {
  amigoSteamId64: string
  nick: string | null
  avatarUrl: string | null
  noSistema: boolean
  naMinhaFamilia: boolean
}

const ordem = (a: Amigo) => (a.naMinhaFamilia ? 0 : a.noSistema ? 1 : 2)

// RN-FAM-04: amigos Steam com busca; quem já está no sistema ou na família aparece primeiro.
export function ListaAmigos({ amigos, podeIndicar }: { amigos: Amigo[]; podeIndicar: boolean }) {
  const [busca, setBusca] = useState('')
  const termo = useDeferredValue(busca.trim().toLocaleLowerCase('pt-BR'))
  const visiveis = amigos
    .filter(
      (a) => !termo || (a.nick ?? a.amigoSteamId64).toLocaleLowerCase('pt-BR').includes(termo),
    )
    .sort((a, b) => ordem(a) - ordem(b) || (a.nick ?? '').localeCompare(b.nick ?? '', 'pt-BR'))
  return (
    <div className="flex flex-col gap-3">
      <InputGroup className="sm:max-w-sm">
        <InputGroupInput
          placeholder={`Buscar entre ${String(amigos.length)} amigos`}
          aria-label="Buscar amigo"
          value={busca}
          onChange={(e) => {
            setBusca(e.currentTarget.value)
          }}
        />
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
      </InputGroup>
      <ul className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
        {visiveis.map((f) => (
          <li
            key={f.amigoSteamId64}
            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              <PessoaAvatar apelido={f.nick ?? '?'} url={f.avatarUrl} />
              <span className="truncate">{f.nick ?? f.amigoSteamId64}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {f.naMinhaFamilia ? (
                <StatusBadge rotulo="Na família" tom="sucesso" />
              ) : f.noSistema ? (
                <StatusBadge rotulo="No sistema" tom="neutro" />
              ) : null}
              {podeIndicar && !f.naMinhaFamilia && (
                <FormAcao acao={indicarAcao} sucesso="Indicação enviada para aprovação">
                  <input type="hidden" name="conta" value={f.amigoSteamId64} />
                  <BotaoEnviar size="sm" variant="outline">
                    Indicar
                  </BotaoEnviar>
                </FormAcao>
              )}
            </span>
          </li>
        ))}
        {visiveis.length === 0 && (
          <li className="text-sm text-muted-foreground">Nenhum amigo com esse nome.</li>
        )}
      </ul>
    </div>
  )
}
