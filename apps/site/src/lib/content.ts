import { resolve } from 'node:path'
import { loadAll, type Content } from '@aq/schema'
import { dropHidden, readHidden } from './hidden'

let cache: Promise<Content> | undefined

export function getContent(): Promise<Content> {
  cache ??= loadAll({
    root: process.env.CONTENT_ROOT ?? resolve(process.cwd(), '../../content'),
    lang: 'vi',
    publicBuild: process.env.PUBLIC_BUILD === '1',
  }).then(c => dropHidden(c, readHidden()))
  return cache
}
