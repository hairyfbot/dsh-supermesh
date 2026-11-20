/** 准入强度：explicit 是人明确点名，inferred 只是进流程的候选。 */
export type TriggerStrength = 'explicit' | 'inferred'

/** inferred 候选的处理档位：off 只留时间线，observe 只分诊，auto 才允许建票。 */
export type InferredMode = 'off' | 'observe' | 'auto'
