import type { ReactNode } from 'react'
import type { GetApiSupermeshChannelResponse } from '@/client/apis/index.type'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { useQuery } from '@tanstack/react-query'
import { getApiSupermeshSetting } from '@/client/apis'
import { keys } from '@/client/config/query-keys'
import { useActions } from '@/client/hooks/use-store'
import { useTranslation } from '@/client/hooks/use-translation'

export function AdmissionNotice({ channel }: { channel?: GetApiSupermeshChannelResponse[number] }): ReactNode {
  const { t } = useTranslation()
  const { go, setSettingSection } = useActions()
  const setting = useQuery({ queryKey: keys.setting, queryFn: () => getApiSupermeshSetting() })
  const empty = setting.data !== undefined && setting.data.administrators.length === 0
  const drop = channel?.lastDrop?.reason === 'not_administrator' ? channel.lastDrop : null
  if (!empty && !drop)
    return null
  return (
    <div className="m-0 flex flex-col gap-2 rounded-xl border border-(--dsw-alias-state-error-primary) px-4 py-3 text-xs leading-5 text-(--dsw-alias-state-error-primary)">
      {empty && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span role="status">{t('channelAdministratorsMissing')}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSettingSection('general')
              go('setting')
            }}
          >
            {t('channelAdministratorsConfigure')}
          </Button>
        </div>
      )}
      {drop && <span role="status">{t('channelLastDropNotAdministrator', { actor: drop.actor, time: new Date(drop.at).toLocaleString() })}</span>}
    </div>
  )
}
