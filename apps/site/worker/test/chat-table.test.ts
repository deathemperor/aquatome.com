import { expect, test } from 'vitest'
import { testD1 } from './d1'

test('the past conversations\' table holds what the owner approved and no answers: a new column needs the owner\'s OK', async () => {
  const { results } = await testD1().prepare('PRAGMA table_info(chat_conversations)').all<{ name: string }>()
  expect(results.map(c => c.name)).toEqual(['account', 'id', 'title', 'start', 'first_at', 'last_at', 'questions', 'continues', 'hidden'])
})
