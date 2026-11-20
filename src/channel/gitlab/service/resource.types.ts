export interface Resource {
  site: string
  repository: string
  number: number
  kind: 'issue' | 'pull'
}
