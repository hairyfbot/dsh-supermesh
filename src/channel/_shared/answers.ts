/** 逐行产出回答候选，跳过围栏代码块里的内容。 */
export function* answerLines(body: string): Generator<string> {
  let fenced = false
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*~{3}|^\s*```/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced)
      continue
    yield line
  }
}
