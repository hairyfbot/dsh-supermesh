import { defineHandler } from 'h3'
import { project } from '../../service/project'

export const postProjects = defineHandler(async () => project.sync())
