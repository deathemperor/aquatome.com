import type { APIRequestContext } from '@playwright/test'
import { expect, test, vi } from 'vitest'
import { albumPage } from '../e2e/album'

vi.mock('../e2e/pages', () => ({
  sourcePages: () => ['/ca/first/', '/ca/second/', '/ca/third/', '/cay/skip/'],
}))

const album = (name: string) => ({
  text: async () => `<section data-album><script type="application/json">${JSON.stringify({ name, photos: [{}] })}</script></section>`,
})

test('album discovery overlaps requests and selects the first match in sitemap order', async () => {
  let releaseFirst!: () => void
  const firstCanReply = new Promise<void>(resolve => { releaseFirst = resolve })
  const get = vi.fn(async (path: string) => {
    if (path === '/ca/first/') await firstCanReply
    if (path === '/ca/third/') throw new Error('an unread candidate after the match')
    return album(path)
  })
  const found = albumPage({ get } as unknown as APIRequestContext, 'ca')
  const requestedBeforeFirstReply = get.mock.calls.map(([path]) => path)
  releaseFirst()

  await expect(found).resolves.toMatchObject({ path: '/ca/first/' })
  expect(requestedBeforeFirstReply).toEqual(['/ca/first/', '/ca/second/', '/ca/third/'])
  expect(get).toHaveBeenCalledWith('/ca/first/', { maxRetries: 1 })
})

test('failure to read an earlier candidate fails album discovery', async () => {
  const reset = new Error('request failed after the retry')
  const get = vi.fn(async (path: string) => {
    if (path === '/ca/first/') throw reset
    return album(path)
  })
  await expect(albumPage({ get } as unknown as APIRequestContext, 'ca')).rejects.toBe(reset)
})
