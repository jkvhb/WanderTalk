import { describe, expect, it } from 'vitest'
import { searchCommonsImages } from './commonsImages'

describe('searchCommonsImages', () => {
  it('normalizes downloadable Commons files with attribution', async () => {
    const fetchMock = async () => ({
      ok: true,
      json: async () => ({ query: { pages: {
        7: { pageid: 7, title: 'File:Bridge.jpg', imageinfo: [{
          thumburl: 'https://upload.wikimedia.org/bridge.jpg',
          descriptionurl: 'https://commons.wikimedia.org/wiki/File:Bridge.jpg',
          extmetadata: { Artist: { value: 'Author' }, LicenseShortName: { value: 'CC BY-SA' } },
        }] },
      } } }),
    })
    const out = await searchCommonsImages({ q: 'bridge' }, fetchMock)
    expect(out).toEqual([expect.objectContaining({ provider: 'commons', id: '7', title: 'Bridge.jpg' })])
    expect(out[0].attribution.license).toBe('CC BY-SA')
  })

  it('drops files outside the approved upload host', async () => {
    const fetchMock = async () => ({ ok: true, json: async () => ({ query: { pages: { 8: { pageid: 8, title: 'File:Bad.jpg', imageinfo: [{ url: 'https://example.com/bad.jpg' }] } } } }) })
    await expect(searchCommonsImages({ q: 'bad' }, fetchMock)).resolves.toEqual([])
  })
})
