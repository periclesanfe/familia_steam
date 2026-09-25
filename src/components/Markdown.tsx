import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// RN-ACE-15: HTML cru escapado (sem rehype-raw), urlTransform padrão, links externos com
// noopener. Server Component: nada de JS de Markdown no cliente (13 DP-12).
type No = NonNullable<ExtraProps['node']>

const textoDe = (n: No['children'][number] | undefined): string =>
  !n
    ? ''
    : n.type === 'text'
      ? n.value
      : n.type === 'element'
        ? n.children.map(textoDe).join('')
        : ''

const componentes: Components = {
  // Um h1 por página (12 §9): o título do texto vira h2, e assim por diante.
  h1: ({ children }) => <h2 className="text-xl font-semibold">{children}</h2>,
  h2: ({ children }) => <h3 className="mt-4 text-base font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="font-medium">{children}</h4>,
  // "**Art. 23** …" ganha a âncora #art-23 (links do ArtigoRef e de /regulamento#art-N)
  p: ({ node, children }) => {
    const primeiro = node?.children[0]
    const artigo =
      primeiro?.type === 'element' && primeiro.tagName === 'strong'
        ? /^Art\.\s*(\d+)/.exec(textoDe(primeiro))?.[1]
        : undefined
    return artigo ? (
      <p id={`art-${artigo}`} className="scroll-mt-20">
        {children}
      </p>
    ) : (
      <p>{children}</p>
    )
  },
  a: ({ href, children }) => {
    const externo = href?.startsWith('https://') ?? false
    return (
      <a
        href={href}
        className="font-medium underline underline-offset-4"
        {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    )
  },
}

export function Markdown({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_ol]:ml-5 [&_ol]:list-decimal [&_table]:w-full [&_table]:text-left [&_td]:border-t [&_td]:py-1 [&_td]:pr-2 [&_th]:py-1 [&_th]:pr-2 [&_th]:font-medium [&_ul]:ml-5 [&_ul]:list-disc">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentes}>
        {texto}
      </ReactMarkdown>
    </div>
  )
}
