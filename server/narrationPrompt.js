export function buildNarrationMessages(item) {
  const system =
    '你是中文旅行讲解撰稿人，为自驾路线视频写旁白。要求：用自然口语的中文；' +
    '每段约 15~30 秒可读完（约 60~120 字）；可使用 <break time="500ms"/> 与 <emphasis> 等 SSML 标签；' +
    '只依据给定信息，不要编造不存在的事实或具体数字；直接输出旁白正文，不要加任何解释或标题。'
  const parts = [
    `节点：${item.nodeName}`,
    `第 ${item.dayNumber} 天`,
    item.overnight ? `当天住宿：${item.overnight}` : '',
    typeof item.altitude === 'number' ? `海拔：约 ${item.altitude} 米` : '',
    item.prevName ? `上一站：${item.prevName}` : '',
    item.nextName ? `下一站：${item.nextName}` : '',
  ].filter(Boolean)
  return [
    { role: 'system', content: system },
    { role: 'user', content: `请为以下节点写一段讲解旁白：\n${parts.join('\n')}` },
  ]
}
