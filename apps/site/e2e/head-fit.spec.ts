import { pageShard } from '@aq/schema/app-page'
import { expect, shownWhole, test } from './fixtures'
import { LIVE } from './pages'

// A head that no crop can frame without cutting the fish carries `headFit: "contain"` and shows whole, in its own shape,
// on a phone and a computer (PhotoGallery.astro). A head whose box the frame can fill keeps the frame's crop. On the fixture, the cockatoo
// cichlid's head carries the mark; on the live site, every sampled page's marked head is checked (invariants.spec.ts).

for (const path of ['/ca/ca-apisto-cacatuoides/', '/ms/ikan/ikan-uji-melayu/']) test(`a marked head is uncut, in its own shape, with its credit: ${path}`, async ({ page, request, errors }) => {
  test.skip(LIVE, 'reads the cockatoo cichlid fixture, outside the shared app vectors')
  await page.goto(path)
  const head = page.locator('main .gallery .plate img')
  await expect(head).toHaveAttribute('data-fit', 'contain')
  expect(await shownWhole(head), 'the head is cut').toBe(true)
  const box = (await head.boundingBox())!
  expect(Math.abs(box.width / box.height - 960 / 720)).toBeLessThan(0.02)
  const credit = page.locator('main .gallery figcaption a.cite.pic')
  await expect(credit).toHaveAttribute('data-tip', 'CC BY-SA 3.0')
  await expect(credit).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:Cacatuoides.JPG')
  // The app's card and page head are this photo too, with its whole area as the box, so a frame of another shape shows it
  // whole (the Design Lead's line, accepted by the chief of staff, 13 Nov).
  const whole={x:0,y:0,w:1,h:1},lang=path.startsWith('/ms/')?'ms':'vi',index=await (await request.get(`/app/${lang}.json`)).json()
  const item=index.items.find((i:{id:string})=>i.id==='apistogramma-cacatuoides')
  expect(item, 'marked page is still listed').toBeTruthy();expect(item.img).toBeTruthy();expect(item.imgBox).toEqual(whole)
  const shard=await (await request.get(`/app/pages/${lang}/fish-${pageShard(item.path,index.shards.fish.n)}.json`)).json()
  expect(shard.pages[item.path].lead).toMatchObject({src:await head.getAttribute('src'),box:whole})
  expect(errors).toEqual([])
})

// The ram's head has a box both the phone's 16:9 and the computer's 4:3 can fill (test/engine-state/_photo-boxes.json). A
// head with no box takes its whole area, and shows whole where its shape is off the frame's.
test("a head with no mark keeps the frame's crop", async ({ page, request }, info) => {
  test.skip(LIVE, 'reads a fixture page')
  await page.goto('/ca/ca-phuong-hoang/')
  const head = page.locator('main .gallery .plate img')
  await expect(head).not.toHaveAttribute('data-fit')
  expect(await head.evaluate(i => getComputedStyle(i).objectFit)).toBe('cover')
  const box = (await head.boundingBox())!
  // A phone's fish page frames it 16:9, a computer's 4:3 (pages/ca/[slug].astro, PhotoGallery.astro).
  expect(box.width / box.height).toBeCloseTo(info.project.name === 'phone' ? 16 / 9 : 4 / 3, 1)
  const index=await (await request.get('/app/vi.json')).json(),item=index.items.find((i:{id:string})=>i.id==='mikrogeophagus-ramirezi')
  expect(item.img).toBeTruthy()
  const shard=await (await request.get(`/app/pages/vi/fish-${pageShard(item.path,index.shards.fish.n)}.json`)).json()
  expect(shard.pages[item.path].lead.src).toBe(await head.getAttribute('src'))
})
