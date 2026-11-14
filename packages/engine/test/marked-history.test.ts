import { test, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { recoverMarkedHistory } from '../src/marked-photo-history'
import { rememberMarkedPhotos } from '../src/marked-photos'

test('a photo formerly dropped for a mark is recovered with its exact credit; new marked albums also enter the private queue', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'marked-history-'))
  try {
    const cache = join(dir, 'private'), root = join(dir, 'repo'), page = join(root, 'content/species/fish/entity.json')
    await mkdir(join(root, 'content/species/fish'), { recursive: true }); await mkdir(join(root, 'engine-state')); await mkdir(cache)
    const photo = { url: 'https://media.aquatome.com/bwaquatics/example.webp', width: 800, height: 600, licence: 'dùng với sự cho phép', author: 'Fixture credit', source: 'bwaquatics', sourceUrl: 'https://bwaquatics.com/species/fish' }
    await writeFile(page, JSON.stringify({ photos: [photo] }, null, 2))
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' })
    git('init', '-q'); git('-c', 'user.name=Engine test', '-c', 'user.email=test@example.invalid', 'add', '.')
    git('-c', 'user.name=Engine test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'test: original photo')
    await writeFile(page, JSON.stringify({ photos: [] }, null, 2)); git('add', '.')
    git('-c', 'user.name=Engine test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'test: marked photo dropped')
    await writeFile(join(root, 'engine-state/_photo-watermarks.json'), JSON.stringify({ [photo.url]: { watermark: true } }))
    await recoverMarkedHistory(root, cache)
    const files = await readdir(join(cache, 'marked'))
    expect(files).toHaveLength(1)
    expect(JSON.parse(await readFile(join(cache, 'marked', files[0]!), 'utf8'))).toEqual({ page: { kind: 'species', id: 'fish' }, photo })
    await rememberMarkedPhotos(join(root, 'content/gallery/fish.json'), { photos: [{ ...photo, url: photo.url + '?second' }] }, () => true, cache)
    expect(await readdir(join(cache, 'marked'))).toHaveLength(2)
    await recoverMarkedHistory(root, cache)
    expect(await readdir(join(cache, 'marked'))).toHaveLength(2)
    expect(JSON.parse(await readFile(page, 'utf8')).photos).toEqual([])
  } finally { await rm(dir, { recursive: true, force: true }) }
})
