// 一次性为整条路线生成旁白：按全程上下文，要求 JSON 输出、以真实地址纠偏。
export function buildPlanNarrationMessages(items) {
  const system =
    '你是中文旅行讲解撰稿人，为一整条自驾路线视频写旁白。要求：\n' +
    '1) 按节点顺序、用「第X天」自然串联，前后段落要承接、有整体节奏；\n' +
    '2) 每段约 15~30 秒（约 60~120 字），自然口语的中文；\n' +
    '3) 各段内容不要雷同，不要重复别的节点已说过的句子；\n' +
    '4) 严格以「实际位置」为准——节点名称可能有歧义（例如某店名里含某地名、实际却在另一座城市）；只依据给定信息，不要编造具体事实或数字；\n' +
    '5) 只输出 JSON，格式：{"list":[{"dayNumber":数字,"index":数字,"narration":"该段旁白正文"}]}，不要输出任何额外说明文字。'
  const lines = items.map((it) => {
    const bits = [`第${it.dayNumber}天`, `index=${it.index}`, `节点:${it.nodeName}`]
    if (it.address) bits.push(`实际位置:${it.address}`)
    if (typeof it.altitude === 'number') bits.push(`海拔约${it.altitude}米`)
    if (it.overnight) bits.push(`当天住宿:${it.overnight}`)
    return bits.join(' | ')
  })
  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content:
        '路线节点（按顺序；请为每个节点写一段旁白，并原样回填它的 dayNumber 与 index）：\n' +
        lines.join('\n'),
    },
  ]
}
