import { expect, test } from 'vitest'
import sharp from 'sharp'
import type { GeneratedRecord } from '@aq/schema'
import { storeImageVariants } from '../src/image-publication'

// No provider or media-store call: prove the existing encoder carries the kind's machine mark in every served copy.
test('a glossary stand-in keeps its generated provenance in main, thumbnail and large file metadata', async () => {
  const generated: GeneratedRecord = { model: 'unreported', driverModel: 'gpt-6.1-sol', date: '2026-11-17', prompt: 'Two substrate layers, no lettering.', referenceHash: 'a'.repeat(64), pixelHash: 'b'.repeat(64) }
  const original = await sharp({ create: { width: 1300, height: 900, channels: 3, background: '#78654c' } }).png().toBuffer()
  const files: Uint8Array[] = []
  const result = await storeImageVariants(original, { generated }, async (key, bytes) => {
    files.push(bytes)
    return `https://media.aquatome.com/${key}`
  })
  expect(files).toHaveLength(3)
  expect(result.thumb).toBeTruthy(); expect(result.large).toBeTruthy()
  for (const bytes of files) {
    const xmp = (await sharp(bytes).metadata()).xmp?.toString() ?? ''
    expect(xmp).toContain('trainedAlgorithmicMedia')
    for (const value of Object.values(generated)) expect(xmp).toContain(value)
  }
})
