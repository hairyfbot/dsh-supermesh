/**
 * 准入强度：explicit 是人明确点名，inferred 只是进流程的候选。
 * self 只表示「这是你自己开的活」（主编排在别的仓库新建的 issue），不表示有人批准过，永远不等于 explicit。
 */
export type TriggerStrength = 'explicit' | 'inferred' | 'self'

/** inferred 候选的处理档位：off 只留时间线，observe 只分诊，auto 才允许建票。 */
export type InferredMode = 'off' | 'observe' | 'auto'
