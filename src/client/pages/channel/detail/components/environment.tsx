import type { ReactNode } from 'react'
import { useTranslation } from '../../../../hooks/use-translation'
import { Section } from './section'

export function Environment({ description }: { description: string }): ReactNode {
  const { t } = useTranslation()
  return (
    <aside className="flex min-w-0 flex-col gap-4">
      <Section title={t('channelIdentity')}>
        <dl className="m-0 flex flex-col gap-2">
          <dt className="text-xs text-(--dsw-alias-label-secondary)">{t('channelCredentialLocation')}</dt>
          <dd className="m-0 break-all rounded-lg bg-(--dsw-alias-card-fill) px-3 py-2 font-mono text-xs">{t('channelCredentialManaged')}</dd>
        </dl>
        <p className="m-0 text-xs leading-5 text-(--dsw-alias-label-secondary)">{t('channelCredentialProtection')}</p>
        <p className="m-0 text-xs leading-5 text-(--dsw-alias-label-secondary)">{description}</p>
      </Section>
      <p className="m-0 px-1 text-xs leading-5 text-(--dsw-alias-label-tertiary)">{t('channelSecurityNotice')}</p>
    </aside>
  )
}
