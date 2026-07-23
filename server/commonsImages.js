const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'

export async function searchCommonsImages({ q }, fetchImpl = fetch) {
  if (!q || !String(q).trim()) return []
  const url = new URL(COMMONS_API)
  url.searchParams.set('action', 'query')
  url.searchParams.set('generator', 'search')
  url.searchParams.set('gsrsearch', String(q).trim())
  url.searchParams.set('gsrnamespace', '6')
  url.searchParams.set('gsrlimit', '20')
  url.searchParams.set('prop', 'imageinfo')
  url.searchParams.set('iiprop', 'url|extmetadata')
  url.searchParams.set('iiurlwidth', '1600')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  const res = await fetchImpl(url)
  if (!res.ok) {
    const err = new Error(`Wikimedia Commons request failed (${res.status})`)
    err.status = 502
    throw err
  }
  const data = await res.json().catch(() => ({}))
  return Object.values(data?.query?.pages || {})
    .map((page) => {
      const info = page?.imageinfo?.[0] || {}
      const imageUrl = info.thumburl || info.url
      if (!imageUrl || !/^https:\/\/upload\.wikimedia\.org\//i.test(imageUrl)) return null
      const meta = info.extmetadata || {}
      return {
        id: String(page.pageid),
        provider: 'commons',
        title: String(page.title || '').replace(/^File:/i, ''),
        tags: String(page.title || '').replace(/^File:/i, ''),
        webformatURL: imageUrl,
        largeImageURL: imageUrl,
        pageURL: info.descriptionurl || '',
        attribution: {
          author: meta.Artist?.value || '',
          license: meta.LicenseShortName?.value || '',
          licenseUrl: meta.LicenseUrl?.value || '',
        },
      }
    })
    .filter(Boolean)
}
