// Phase 4e：展示页编排动效——DeepSeek 依旁白文本为每个节点生成动效配置 JSON。
// 铁律：LLM 只输出受限 JSON（选词+调参+分相位），绝不输出代码/CSS；
// 词汇表语义与前端 src/utils/choreography.js 人工保持同步（改一边记得改另一边）。
// 依赖注入风格同 images.js / narration.js，方便 mock callLLM 做单测。

function buildChoreographyMessages(nodes) {
  const system =
    '你是旅行视频动效导演，为"到站展示页"的图片编排动效配置。展示页有若干张图片卡片，' +
    '它们错峰入场、缓慢漂移，并随旁白讲解的推进切换焦点图片。你的工作是依据每个节点的旁白文本，' +
    '为它选节奏、分相位、调待机强度。可用词汇表：\n' +
    '1) tempo：整体节奏，"calm"（舒缓叙事，慢入场慢漂移）| "medium"（默认中速）| "lively"（明快亮点，快入场明显漂移）；\n' +
    '2) phases：相位数组，按旁白进度切换焦点图片。每项 { "at": 旁白进度比例(0~1，升序，首个必须 0), "focus": 焦点图片下标(0 起，必须小于该节点 imageCount), "accent": "none" | "pulse" }；' +
    '依旁白文本结构分相位（开场/描述/收尾各一段较自然），感叹或亮点句所在相位可用 "pulse"（焦点卡短促强调弹跳）；\n' +
    '3) idle：待机强度 { "drift": 0~1 漂移幅度, "breathe": 0~1 呼吸幅度 }，舒缓文本取小、活泼文本取大；\n' +
    '4) transition: { "enter": "photo-cascade", "anchor": "route-end", "direction": "forward", "energy": "medium", "layout": "scattered-cards", "exit": "follow-route" }. Allowed literals: enter=route-bloom|directional-wipe|photo-cascade|soft-dissolve|layer-unfold|chapter-slide; anchor=route-end|screen-center|image-focus; direction=forward|left|right|up|down; energy=calm|medium|accent; layout=text-first|hero-image|scattered-cards|sequential-cards; exit=return-map|follow-route|soft-dissolve. route-bloom is for map/road geography; photo-cascade and layer-unfold need images; text-first is for a text-only stop; forward is the next-route direction; calm tends to soft-dissolve. Example config: {"tempo":"medium","transition":{"enter":"photo-cascade","anchor":"route-end","direction":"forward","energy":"medium","layout":"scattered-cards","exit":"follow-route"},"phases":[{"at":0,"focus":0,"accent":"none"}],"idle":{"drift":0.4,"breathe":0.3}};\n' +
    '5) Output JSON only, with no explanation, code, CSS, or extra text. Format: {"results":[{"index":number,"config":{"tempo":"...","transition":{"enter":"...","anchor":"...","direction":"...","energy":"...","layout":"...","exit":"..."},"phases":[...],"idle":{...}}}]}. Return index unchanged.\n';
  const lines = nodes.map((n) => {
    const count = n.imageCount ?? 0
    return `index=${n.index} | 图片数 imageCount=${count} | 旁白:${n.narration || ''}`
  })
  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: '节点列表（请为每个节点生成动效配置，并原样回填 index）：\n' + lines.join('\n'),
    },
  ]
}

// callLLM({apiKey,model,messages,json}) -> string，同 narration.js 的 callDeepSeek 签名。
// 返回原始 results 数组——数值清洗/越界处理交给前端 normalizeChoreography（客户端兜底更可靠）。
export function makeChoreographyGenerator({ callLLM }) {
  return async function generateChoreography({ apiKey, nodes, model }) {
    const content = await callLLM({
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
