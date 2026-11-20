export interface Resource {
  repository: string
  number: number
  kind: 'issue' | 'pull'
}
