// 纯函数：用 Pixabay 标签串与节点关键词做"标签互证"计分（无标题/简介可用时的折中方案）。

// tags：逗号分隔标签串（如 "tibet, mountain, sky"）；keywords：关键词列表（中英混合）。
// 子串宽松匹配：关键词是标签的子串，或标签是关键词的子串，都算命中（如 "tibet" 命中 "tibetan"）。
// 返回 0~1：命中的关键词数 / 关键词总数（去重，不会因重复关键词或多标签命中同一关键词而超过 1）。
export function scoreImageMatch(tags, keywords) {
  if (!tags || !Array.isArray(keywords) || keywords.length === 0) return 0
  const tagList = String(tags)
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
  if (tagList.length === 0) return 0

  const uniqueKeywords = [...new Set(keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean))]
  if (uniqueKeywords.length === 0) return 0

  let hits = 0
  for (const kw of uniqueKeywords) {
    const matched = tagList.some((tag) => tag.includes(kw) || kw.includes(tag))
    if (matched) hits++
  }
  return hits / uniqueKeywords.length
}

// hits：Pixabay 搜索结果数组（含 id/tags 等字段）；按 scoreImageMatch 降序排序，
// 过滤低于阈值的，去重（按 id），取前 count 个。数量不足 count 时返回实际有的数量。
export function pickImages(hits, keywords, count = 3, threshold = 0.15) {
  if (!Array.isArray(hits) || hits.length === 0) return []

  const seen = new Set()
  const deduped = []
  for (const h of hits) {
    if (!h || seen.has(h.id)) continue
    seen.add(h.id)
    deduped.push(h)
  }

  return deduped
    .map((h) => ({ hit: h, score: scoreImageMatch(h.tags, keywords) }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((x) => x.hit)
}
