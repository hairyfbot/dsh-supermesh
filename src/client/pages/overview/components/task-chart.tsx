import type { } from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { ReactNode } from 'react'
import type { OverviewTaskSegment } from '../../../types'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { useTranslation } from '../../../hooks/use-translation'

export function TaskChart({ segments }: { segments: OverviewTaskSegment[] }): ReactNode {
  const { t } = useTranslation()
  return (
    <figure className="pointer-events-none size-25 shrink-0 [&_*]:outline-none" role="img" aria-label={segments.map(segment => `${t(segment.name)} ${segment.value}`).join(' · ')}>
      {segments.some(segment => segment.value > 0)
        ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart accessibilityLayer={false}>
                <Pie rootTabIndex={-1} data={segments} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={46} startAngle={90} endAngle={-270} paddingAngle={4} cornerRadius={4} stroke="none" isAnimationActive={false}>
                  {segments.map(segment => <Cell key={segment.name} fill={segment.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )
        : <svg width="100%" height="100%" viewBox="0 0 100 100" aria-hidden="true"><circle cx={50} cy={50} r={40.5} fill="none" stroke="var(--dsw-alias-border-l3)" strokeWidth={11} /></svg>}
    </figure>
  )
}
