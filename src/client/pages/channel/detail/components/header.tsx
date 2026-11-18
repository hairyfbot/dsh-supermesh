import type { ReactNode } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useTranslation } from '../../../../hooks/use-translation'

export function DetailHeader({ name, icon, supported = true, actions }: { name: string, icon: ReactNode, supported?: boolean, actions?: ReactNode }): ReactNode {
  const { t } = useTranslation()
  return (
    <header className="flex flex-wrap items-center gap-3">
      <span className="flex size-11 items-center justify-center rounded-xl bg-(--dsw-alias-card-fill)">{icon}</span>
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-base font-medium">{name}</h2>
        <p className="m-0 text-xs text-(--dsw-alias-label-secondary)">{t('channelSettings')}</p>
      </div>
      {!supported && <Tag tone="quiet">{t('channelUnsupported')}</Tag>}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </header>
  )
}
