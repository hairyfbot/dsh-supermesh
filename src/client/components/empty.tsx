import type { ReactNode } from 'react'

export function Empty({ title, description, icon, children, compact = false, inline = false, className = '' }: { title: ReactNode, description?: ReactNode, icon?: ReactNode, children?: ReactNode, compact?: boolean, inline?: boolean, className?: string }): ReactNode {
  if (inline) {
    return (
      <p role="status" className={`m-0 text-[13px] leading-5 text-(--dsw-alias-label-secondary) ${className}`}>
        {icon && <span aria-hidden="true" className="mr-2 inline-flex align-middle">{icon}</span>}
        {title}
        {description && <span className="ml-1">{description}</span>}
        {children}
      </p>
    )
  }
  return (
    <div role="status" className={`${compact ? 'flex min-w-0 flex-col gap-1 text-left text-[13px] leading-5' : 'flex min-h-36 flex-col items-center justify-center gap-2 px-5 py-8 text-center'} text-(--dsw-alias-label-tertiary) ${className}`}>
      {icon && <span aria-hidden="true" className="mb-1 flex shrink-0 opacity-60">{icon}</span>}
      <p className={`m-0 text-(--dsw-alias-label-secondary) ${compact ? 'text-[13px] leading-5' : 'text-sm font-medium'}`}>{title}</p>
      {description && <p className="m-0 max-w-md text-xs leading-5">{description}</p>}
      {children}
    </div>
  )
}
