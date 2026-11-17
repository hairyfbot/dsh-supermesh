import { defineHandler } from 'h3'
import { project } from '../../service/project'

export const refreshProjects = defineHandler(async () => project.sync())
