declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'supermesh-mailbox': { kind: 'supermesh-mailbox', form: 'notice', summary: string, revision: string }
    'supermesh-mailbox-context': { kind: 'supermesh-mailbox-context', form: 'notice', summary: string, revision: string }
  }
}

export {}
