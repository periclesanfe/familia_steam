import { ConfirmarAcao } from '@/components/ConfirmarAcao'
import { FormAcao } from '@/components/FormAcao'
import { votarAcao } from '@/features/votacoes/acoes'

const OPCOES = [
  ['FAVOR', 'Votar a favor'],
  ['CONTRA', 'Votar contra'],
  ['ABSTENCAO', 'Abster-se'],
] as const

// RN-VOT-03: voto irretratável e nominal — sempre com confirmação.
export function BotoesDeVoto({ votacaoId }: { votacaoId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {OPCOES.map(([opcao, rotulo]) => (
        <FormAcao key={opcao} id={`voto-${opcao}`} acao={votarAcao} sucesso="Voto registrado">
          <input type="hidden" name="votacaoId" value={votacaoId} />
          <input type="hidden" name="opcao" value={opcao} />
          <ConfirmarAcao
            formId={`voto-${opcao}`}
            rotulo={rotulo}
            titulo={`${rotulo}?`}
            consequencias={[
              'O voto é nominal, visível a todos e irretratável.',
              'Abstenção nunca conta a favor.',
            ]}
            artigo="Art. 41"
          />
        </FormAcao>
      ))}
    </div>
  )
}
