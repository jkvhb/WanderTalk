function buildChoreographyMessages(nodes) {
  const system = [
    '你是旅行纪录片的内容编辑。你的任务不是设计动画，而是理解旁白与图片资料之间的对应关系。',
    '只输出受限的节点讲解语义：',
    '1) schemaVersion 固定为 2。',
    '2) storyMode 只能是 sequential（按顺序讲述）、parallel（并列介绍）或 hero（单一重点）。',
    '3) imageOrder 是图片下标的排列。结合每张图片的标题、标签、简介和来源说明，按旁白实际提及顺序排列；资料不足时保持原顺序。',
    '4) beats 是旁白进度与重点图片的对应数组，每项为 {"at":0到1,"focus":有效图片下标}，升序且首项 at 必须为 0。',
    '5) emphasis 只能是 name、altitude、route、scenery。',
    'imageCount 为 0 时，imageOrder 和 beats 必须为空数组。',
    '不得输出具体坐标、预设名称、CSS、HTML、脚本、遮罩、地图缩放或动画名称。',
    '只输出 JSON，不要解释或 Markdown。格式：',
    '{"results":[{"index":0,"config":{"schemaVersion":2,"storyMode":"sequential","imageOrder":[0,1],"beats":[{"at":0,"focus":0}],"emphasis":"name"}}]}',
    '原样返回每个 index。',
  ].join('\n')

  const lines = nodes.map((node) => {
    const images = (Array.isArray(node.images) ? node.images : []).map((image) => ({
      index: image.index,
      title: image.title || '',
      tags: image.tags || '',
      description: image.description || '',
      provider: image.provider || '',
    }))
    return JSON.stringify({
      index: node.index,
      imageCount: node.imageCount ?? 0,
      narration: node.narration || '',
      images,
    })
  })

  return [
    { role: 'system', content: system },
    { role: 'user', content: `节点列表（每行一个 JSON）：\n${lines.join('\n')}` },
  ]
}

export function makeChoreographyGenerator({ callLLM }) {
  return async function generateChoreography({ provider, apiKey, nodes, model }) {
    const content = await callLLM({
      provider,
      apiKey,
      model,
      messages: buildChoreographyMessages(nodes),
      json: true,
    })
    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      throw new Error('AI 返回的不是有效 JSON，请重试')
    }
    const list = Array.isArray(parsed) ? parsed : parsed.results || parsed.list || []
    return Array.isArray(list) ? list : []
  }
}
