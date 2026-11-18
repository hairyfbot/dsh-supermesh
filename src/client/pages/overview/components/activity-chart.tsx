import type { } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { ReactNode } from 'react'
import type { GetApiNexusTriggerResponse } from '../../../apis/index.type'
import { useId } from 'react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'

export function ActivityChart({ triggers: source }: { triggers: GetApiNexusTriggerResponse }): ReactNode {
  const id = useId().replaceAll(':', '')
  const now = Date.now()
  const triggers = source.filter(trigger => Date.parse(trigger.at) >= now - 86400000 && Date.parse(trigger.at) <= now)
  const activity = Array.from({ length: 24 }, (_, index) => {
    const end = now - (23 - index) * 3600000
    const start = end - 3600000
    return { time: new Date(end).toISOString(), messages: triggers.filter(trigger => Date.parse(trigger.at) >= start && (index === 23 ? Date.parse(trigger.at) <= end : Date.parse(trigger.at) < end)).length }
  })
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-37 opacity-60" aria-hidden="true" style={{ maskImage: 'linear-gradient(to right, transparent 5%, black 70%)' }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={activity} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} accessibilityLayer={false}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--dsw-alias-state-business-primary)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="var(--dsw-alias-state-business-primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="messages" stroke="var(--dsw-alias-state-business-primary)" strokeWidth={1.8} fill={`url(#${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
