import { defineHandler } from 'h3'
import { project } from '../../service/project'

export default defineHandler(async () => project.sync())
