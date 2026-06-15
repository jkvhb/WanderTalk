import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import {
  saveTrip,
  loadTrip,
  clearTrip,
  getCachedRoute,
  setCachedRoute,
  getCachedAudio,
  setCachedAudio,
  putImage,
  getImage,
  deleteImage,
} from './db'

describe('db', () => {
  it('saveTrip / loadTrip round trip', async () => {
    expect(await loadTrip()).toBeUndefined()
    const plan = { name: '测试', days: [{ dayNumber: 1, waypoints: [] }] }
    await saveTrip(plan)
    const loaded = await loadTrip()
    expect(loaded.name).toBe('测试')
    expect(loaded.days).toHaveLength(1)
  })

  it('clearTrip 后读取为空', async () => {
    await saveTrip({ name: 'x', days: [] })
    await clearTrip()
    expect(await loadTrip()).toBeUndefined()
  })

  it('routeCache 读写', async () => {
    expect(await getCachedRoute('a>b')).toBeUndefined()
    await setCachedRoute('a>b', { path: [[1, 2]], distance: 10, duration: 5 })
    const r = await getCachedRoute('a>b')
    expect(r.distance).toBe(10)
    expect(r.path).toEqual([[1, 2]])
  })
})

describe('db audioCache', () => {
  it('setCachedAudio / getCachedAudio round trip', async () => {
    expect(await getCachedAudio('k1')).toBeUndefined()
    const blob = new Blob(['x'], { type: 'audio/mpeg' })
    await setCachedAudio('k1', { blob, duration: 2.5, mime: 'audio/mpeg' })
    const got = await getCachedAudio('k1')
    expect(got.duration).toBe(2.5)
    expect(got.mime).toBe('audio/mpeg')
  })
})

describe('db images', () => {
  it('putImage / getImage 往返', async () => {
    expect(await getImage('img_x')).toBeUndefined()
    const blob = new Blob(['x'], { type: 'image/jpeg' })
    await putImage('img_x', { blob, mime: 'image/jpeg', w: 100, h: 80 })
    const got = await getImage('img_x')
    expect(got.w).toBe(100)
    expect(got.h).toBe(80)
    expect(got.mime).toBe('image/jpeg')
  })

  it('deleteImage 后读取为空', async () => {
    await putImage('img_y', { blob: new Blob(['y']), mime: 'image/jpeg', w: 1, h: 1 })
    await deleteImage('img_y')
    expect(await getImage('img_y')).toBeUndefined()
  })
})
