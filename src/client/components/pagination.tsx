import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { useTranslation } from '../hooks/use-translation'

export interface PaginationProps {
  page: number
  pageCount: number
  onChange: (page: number) => void
  className?: string
}

function range(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index)
}

function pages(page: number, pageCount: number): (number | 'gap')[] {
  if (pageCount <= 7)
    return range(1, pageCount)
  if (page <= 4)
    return [...range(1, 5), 'gap', pageCount]
  if (page >= pageCount - 3)
    return [1, 'gap', ...range(pageCount - 4, pageCount)]
  return [1, 'gap', page - 1, page, page + 1, 'gap', pageCount]
}

export function Pagination({ page, pageCount, onChange, className }: PaginationProps): ReactNode {
  const { t } = useTranslation()
  if (pageCount <= 1)
    return null
  const go = (next: number): void => {
    if (next >= 1 && next <= pageCount && next !== page)
      onChange(next)
  }
  return (
    <nav className={`flex flex-wrap items-center justify-end gap-1 ${className ?? ''}`} aria-label={t('paginationLabel')}>
      <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => go(page - 1)} aria-label={t('paginationPrevious')}>
        {t('paginationPrevious')}
      </Button>
      {pages(page, pageCount).map((item, index) => item === 'gap'
        ? <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-xs leading-7 text-(--dsw-alias-label-tertiary)">…</span>
        : (
            <Button
              key={item}
              size="sm"
              variant={item === page ? 'outline' : 'ghost'}
              aria-current={item === page ? 'page' : undefined}
              aria-label={t('paginationPage', { page: item })}
              onClick={() => go(item)}
              className={item === page ? 'font-medium' : undefined}
            >
              {item}
            </Button>
          ))}
      <Button size="sm" variant="ghost" disabled={page >= pageCount} onClick={() => go(page + 1)} aria-label={t('paginationNext')}>
        {t('paginationNext')}
      </Button>
    </nav>
  )
}
