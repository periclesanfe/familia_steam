import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

// 07 §6.2 / 12 UI-18: avatar da Steam (já validado como *.steamstatic.com) com iniciais de reserva.
export function PessoaAvatar({ apelido, url }: { apelido: string; url: string | null }) {
  const iniciais = apelido
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <Avatar>
      {url && <AvatarImage src={url} alt="" />}
      <AvatarFallback>{iniciais}</AvatarFallback>
    </Avatar>
  )
}
