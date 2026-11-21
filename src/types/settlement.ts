declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'subagent-settled': { kind: 'subagent-settled', form: 'notice', summary: string, stopReason: string, senderSessionId: string }
  }
}

export {}
