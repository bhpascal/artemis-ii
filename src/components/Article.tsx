import { type ReactNode } from 'react'

interface ArticleProps {
  children: ReactNode
}

export function Article({ children }: ArticleProps) {
  return (
    <article className="article">
      <div className="article-body">
        {children}
      </div>
    </article>
  )
}
