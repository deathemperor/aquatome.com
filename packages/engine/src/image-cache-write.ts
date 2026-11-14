import { randomUUID } from 'node:crypto'
import { writeFile, rename, rm } from 'node:fs/promises'

/** A partial write is never a reusable final cache entry. */
export async function writeImageCache(file: string, bytes: string | Uint8Array) {
  const temporary = `${file}.${randomUUID()}.next`
  try {
    await writeFile(temporary, bytes, {mode:0o600,flag:'wx'})
    await rename(temporary, file)
  } finally { await rm(temporary,{force:true}) }
}
