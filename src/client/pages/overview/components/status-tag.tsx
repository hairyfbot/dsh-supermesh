import type { ReactNode } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useQuery } from '@tanstack/react-query'
import { getApiSupermeshStatus } from '@/client/apis'
import { keys } from '@/client/config/query-keys'
import { useTranslation } from '@/client/hooks/use-translation'

export function StatusTag(): ReactNode {
  const { t } = useTranslation()
  const { data: status, isLoading, error } = useQuery({ queryKey: keys.status, queryFn: () => getApiSupermeshStatus(), refetchInterval: 10_000 })
  if (error) {
    return (
      <span title={error instanceof Error ? error.message : undefined} role="alert">
        <Tag tone="danger">{t('graphUnavailable')}</Tag>
      </span>
    )
  }
  return (
    <span title={status?.reason ?? undefined}>
      <Tag tone={status?.state === 'delivery_failed' ? 'danger' : 'quiet'}>
        {t(isLoading ? 'graphLoading' : status?.state === 'running' ? 'graphRunning' : status?.state === 'queued' ? 'graphQueued' : status?.state === 'delivery_failed' ? 'graphDeliveryFailed' : 'graphIdle')}
      </Tag>
    </span>
  )
}
