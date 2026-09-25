import { ConfirmarAcao } from '@/components/ConfirmarAcao'
import { FormAcao } from '@/components/FormAcao'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  declararImpossibilidadeAcao,
  sairDaFamiliaAcao,
  sairDoConsorcioAcao,
} from '@/features/saidas/acoes'

const ATOS = [
  {
    id: 'impossibilidade',
    acao: declararImpossibilidadeAcao,
    rotulo: 'Declarar impossibilidade de pagamento',
    titulo: 'Declarar que não consegue pagar (art. 30)?',
    consequencias: [
      'Você sai dos sorteios a partir do próximo corte.',
      'Suas contribuições continuam até uma ATA suspendê-las.',
      'O grupo delibera sua permanência (você não vota nela).',
    ],
    artigo: 'Art. 30',
    so: 'MEMBRO',
  },
  {
    id: 'consorcio',
    acao: sairDoConsorcioAcao,
    rotulo: 'Sair do consórcio',
    titulo: 'Sair do consórcio?',
    consequencias: [
      'Antes de ser contemplado: sem restituição do que já pagou; nenhuma obrigação nova (art. 32).',
      'Depois de contemplado: continua pagando todas as rodadas do ciclo (art. 33).',
      'Você perde o voto; a família Steam não muda.',
    ],
    artigo: 'Arts. 31 a 33',
    so: 'MEMBRO_OU_PENDENTE',
  },
  {
    id: 'familia',
    acao: sairDaFamiliaAcao,
    rotulo: 'Sair da Família Steam',
    titulo: 'Sair da Família Steam?',
    consequencias: [
      'Quem sai da família sai também do consórcio, com os efeitos dos arts. 32 e 33.',
      'A Steam impõe 1 ano de espera para entrar em outra família; a vaga fica bloqueada.',
      'Lembre de sair da família também na Steam.',
    ],
    artigo: 'Arts. 34 e 35',
    so: 'QUALQUER',
  },
] as const

// 07 §3.14: declarações pessoais, cada uma com as consequências e o artigo (RN-SAI).
export function ZonaDeDeclaracoes({ perfil }: { perfil: string }) {
  const visiveis = ATOS.filter(
    (a) =>
      a.so === 'QUALQUER' ||
      (a.so === 'MEMBRO' && perfil === 'MEMBRO') ||
      (a.so === 'MEMBRO_OU_PENDENTE' && (perfil === 'MEMBRO' || perfil === 'PENDENTE')),
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle>Declarações</CardTitle>
        <CardDescription>
          Atos próprios, sem votação. Leia as consequências antes de confirmar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {visiveis.map((a) => (
          <FormAcao key={a.id} id={`form-${a.id}`} acao={a.acao}>
            <input type="hidden" name="entendi" value="on" />
            <ConfirmarAcao
              formId={`form-${a.id}`}
              rotulo={a.rotulo}
              titulo={a.titulo}
              consequencias={[...a.consequencias]}
              artigo={a.artigo}
            />
          </FormAcao>
        ))}
      </CardContent>
    </Card>
  )
}
