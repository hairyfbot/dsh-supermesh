import type { ReactNode } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getApiSupermeshPending, postApiSupermeshAskIdAnswer } from '@/client/apis'
import { keys } from '@/client/config/query-keys'

/**
 * 话题详情里的回答区：只在本话题确有 pending 的 ask 时出现。
 * 与概览的「待答问题」共用同一个回答接口，避免两处行为不一致。
 */
export function AnswerBox({ threadId }: { threadId: string }): ReactNode {
  const client = useQueryClient()
  const { data: pending } = useQuery({ queryKey: keys.pending, queryFn: () => getApiSupermeshPending(), refetchInterval: 15_000 })
  const answer = useMutation({
    mutationFn: (input: { id: string, answer: string }) => postApiSupermeshAskIdAnswer({ id: encodeURIComponent(input.id) }, { answer: input.answer }),
    onSettled: () => client.invalidateQueries({ queryKey: keys.pending }),
  })
  const [failure, setFailure] = useState<string | null>(null)
  const ask = pending?.find(message => message.kind === 'ask' && message.threadId === threadId)
  if (!ask)
    return null
  const submit = (text: string) => {
    setFailure(null)
    void answer.mutateAsync({ id: ask.id, answer: text }).then((result) => {
      if (!result || result.id !== ask.id || result.answeredBy !== 'user')
        throw new Error('答复提交失败，问题可能已处理')
    }).catch((error: unknown) => {
      setFailure(error instanceof Error ? error.message : '答复提交失败')
    })
  }
  return (
    <section className="rounded-xl border border-(--dsw-alias-border-l3) bg-(--dsw-alias-bg-layer-1) p-4">
      <h3 className="m-0 text-sm font-medium">回答待答问题</h3>
      <p className="m-0 mt-2 whitespace-pre-wrap text-xs leading-5 text-(--dsw-alias-label-secondary)">{ask.message}</p>
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          submit(String(new FormData(form).get('answer') ?? ''))
        }}
      >
        <Input name="answer" required aria-label="答复内容" disabled={answer.isPending} />
        <Button type="submit" size="sm" variant="primary" disabled={answer.isPending}>提交答复</Button>
      </form>
      {failure && <p role="alert" className="m-0 mt-2 text-xs text-(--dsw-alias-state-error-primary)">{failure}</p>}
    </section>
  )
}
