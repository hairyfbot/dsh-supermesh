import type { ReactNode } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getApiSupermeshPending, postApiSupermeshAskIdAnswer } from '../../../apis'
import { keys } from '../../../config/query-keys'
import { useActions } from '../../../hooks/use-store'

export function AskCard(): ReactNode {
  const client = useQueryClient()
  const { openThread } = useActions()
  const { data: pending, error: pendingError } = useQuery({ queryKey: keys.pending, queryFn: () => getApiSupermeshPending(), refetchInterval: 15_000 })
  const answer = useMutation({
    mutationFn: (input: { id: string, answer: string }) => postApiSupermeshAskIdAnswer({ id: encodeURIComponent(input.id) }, { answer: input.answer }),
    onSettled: () => client.invalidateQueries({ queryKey: keys.pending }),
  })
  const [failure, setFailure] = useState<string | null>(null)
  const asks = pending?.filter(message => message.kind === 'ask') ?? []
  const submit = (id: string, text: string) => {
    setFailure(null)
    void answer.mutateAsync({ id, answer: text }).then((result) => {
      if (!result || result.id !== id || result.answeredBy !== 'user')
        throw new Error('答复提交失败，问题可能已处理')
    }).catch((error: unknown) => {
      setFailure(error instanceof Error ? error.message : '答复提交失败')
    })
  }
  if (!asks.length && !failure && !pendingError)
    return null
  return (
    <details className="flex flex-col rounded-2xl border border-(--dsw-alias-border-l3) p-5" aria-label="待答问题">
      <summary className="cursor-pointer text-sm font-medium">待答问题</summary>
      {asks.map(message => (
        <form
          key={message.id}
          className="mt-3 flex flex-col gap-2 border-t border-(--dsw-alias-border-l3) pt-3"
          onSubmit={(event) => {
            event.preventDefault()
            const form = event.currentTarget
            submit(message.id, String(new FormData(form).get('answer') ?? ''))
          }}
        >
          <p className="m-0 whitespace-pre-wrap">{message.message}</p>
          <div className="flex items-center gap-2">
            <Input name="answer" required aria-label="答复内容" disabled={answer.isPending} />
            <Button type="submit" size="sm" variant="primary" disabled={answer.isPending}>提交答复</Button>
            {message.threadId && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => openThread(message.threadId!)}
              >
                打开话题
              </Button>
            )}
          </div>
        </form>
      ))}
      {pendingError && <p role="alert">{pendingError instanceof Error ? pendingError.message : '待答问题加载失败'}</p>}
      {failure && <p role="alert">{failure}</p>}
    </details>
  )
}
