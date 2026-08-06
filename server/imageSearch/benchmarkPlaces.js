const LIST_FIELDS = [
  'aliases',
  'adminPath',
  'nearbyLandmarks',
  'roadRefs',
  'requiredTerms',
  'negativeTerms',
  'visualTraits',
  'evidenceUrls',
]

const NON_EMPTY_LIST_FIELDS = new Set(['adminPath', 'requiredTerms', 'visualTraits', 'evidenceUrls'])
const ROUTE_PROFILES = new Set(['g318', 'g317', 'genyen-south', 'chengdu-city'])
const NODE_TYPES = new Set([
  'named-landmark',
  'road-node',
  'viewpoint',
  'natural-landmark',
  'cultural-landmark',
  'tunnel',
  'village',
  'urban-landmark',
  'commercial-district',
])

const G318_ROADBOOK = 'docs/reference/318-authoritative-roadbook-v1.md'

function benchmarkPlace({
  id,
  routeProfile,
  canonicalName,
  nodeType,
  coordinates = null,
  aliases = [],
  adminPath = [],
  nearbyLandmarks = [],
  roadRefs = [],
  requiredTerms = [],
  negativeTerms = [],
  visualTraits = [],
  evidenceUrls = [],
}) {
  return Object.freeze({
    id,
    routeProfile,
    canonicalName,
    aliases: Object.freeze([...aliases]),
    adminPath: Object.freeze([...adminPath]),
    coordinates: coordinates === null ? null : Object.freeze({ ...coordinates }),
    nearbyLandmarks: Object.freeze([...nearbyLandmarks]),
    roadRefs: Object.freeze([...roadRefs]),
    nodeType,
    requiredTerms: Object.freeze([...requiredTerms]),
    negativeTerms: Object.freeze([...negativeTerms]),
    visualTraits: Object.freeze([...visualTraits]),
    evidenceUrls: Object.freeze([...evidenceUrls]),
  })
}

export const BENCHMARK_PLACES = Object.freeze([
  benchmarkPlace({
    id: 'jinsha-river-bridge-zhubalong',
    routeProfile: 'g318',
    canonicalName: '金沙江大桥（竹巴笼）',
    aliases: ['竹巴笼金沙江大桥', '金沙江大桥'],
    adminPath: ['中国', '四川省', '西藏自治区', '巴塘县', '芒康县', '竹巴笼'],
    nearbyLandmarks: ['竹巴笼', '金沙江'],
    roadRefs: ['G318'],
    nodeType: 'named-landmark',
    requiredTerms: ['金沙江大桥', '竹巴笼'],
    negativeTerms: ['London', 'Tower Bridge', '伦敦', '伦敦塔桥'],
    visualTraits: ['金沙江峡谷', '跨江公路桥', 'G318进藏标识'],
    evidenceUrls: [G318_ROADBOOK],
  }),
  benchmarkPlace({
    id: 'yingguancun-g318-g248-junction',
    routeProfile: 'g318',
    canonicalName: 'G318/G248交叉口（营官村）',
    aliases: ['营官村交叉口', '营官寨三岔路口'],
    adminPath: ['中国', '四川省', '甘孜藏族自治州', '康定市', '营官村'],
    coordinates: { lng: 101.5466692, lat: 30.038074 },
    nearbyLandmarks: ['营官村', '新都桥镇'],
    roadRefs: ['G318', 'G248'],
    nodeType: 'road-node',
    requiredTerms: ['G318', 'G248', '营官村'],
    negativeTerms: [],
    visualTraits: ['道路交叉口', '公路指示牌', '区域地图'],
    evidenceUrls: [G318_ROADBOOK, 'https://www.openstreetmap.org/node/634137812'],
  }),
  benchmarkPlace({
    id: 'nimagong-viewpoint-service-area',
    routeProfile: 'g318',
    canonicalName: '尼玛贡神山大型观景台旅游服务区',
    aliases: ['尼玛贡神山观景台', '尼玛贡观景台'],
    adminPath: ['中国', '四川省', '甘孜藏族自治州', '雅江县'],
    nearbyLandmarks: ['剪子弯山', '卡子拉山'],
    roadRefs: ['G318'],
    nodeType: 'viewpoint',
    requiredTerms: ['尼玛贡神山', '观景台'],
    negativeTerms: [],
    visualTraits: ['高原群山', '大型观景台', '旅游服务区标识'],
    evidenceUrls: [G318_ROADBOOK],
  }),
  benchmarkPlace({
    id: 'sister-lakes',
    routeProfile: 'g318',
    canonicalName: '姊妹湖',
    aliases: ['海子山姊妹湖', '姐妹湖'],
    adminPath: ['中国', '四川省', '甘孜藏族自治州', '巴塘县', '海子山'],
    nearbyLandmarks: ['海子山', '巴塘县'],
    roadRefs: ['G318'],
    nodeType: 'natural-landmark',
    requiredTerms: ['姊妹湖', '海子山'],
    negativeTerms: [],
    visualTraits: ['两座湖泊同框', '高原荒原', '公路观景台'],
    evidenceUrls: [G318_ROADBOOK],
  }),
  benchmarkPlace({
    id: 'midui-glacier',
    routeProfile: 'g318',
    canonicalName: '米堆冰川',
    aliases: ['米堆冰川景区'],
    adminPath: ['中国', '西藏自治区', '林芝市', '波密县', '玉普乡'],
    nearbyLandmarks: ['米堆村', '然乌湖', '波密县'],
    roadRefs: ['G318'],
    nodeType: 'natural-landmark',
    requiredTerms: ['米堆冰川'],
    negativeTerms: ['来古冰川'],
    visualTraits: ['冰舌', '森林', '村落', '冰川湖'],
    evidenceUrls: [G318_ROADBOOK],
  }),

  benchmarkPlace({
    id: 'zhuokeji-chieftain-fortress',
    routeProfile: 'g317',
    canonicalName: '卓克基土司官寨',
    aliases: ['卓克基官寨'],
    adminPath: ['中国', '四川省', '阿坝藏族羌族自治州', '马尔康市', '卓克基镇'],
    nearbyLandmarks: ['西索民居', '梭磨河'],
    roadRefs: ['G317'],
    nodeType: 'cultural-landmark',
    requiredTerms: ['卓克基', '土司官寨'],
    negativeTerms: ['甲居藏寨'],
    visualTraits: ['嘉绒藏族石木建筑', '官寨外墙', '寨门'],
    evidenceUrls: ['https://wlt.xizang.gov.cn/xwzx_69/xydt/202104/t20210414_199431.html'],
  }),
  benchmarkPlace({
    id: 'larung-gar-buddhist-academy',
    routeProfile: 'g317',
    canonicalName: '喇荣五明佛学院',
    aliases: ['色达喇荣五明佛学院', '色达五明佛学院'],
    adminPath: ['中国', '四川省', '甘孜藏族自治州', '色达县', '洛若镇', '喇荣沟'],
    nearbyLandmarks: ['喇荣沟', '色达县'],
    roadRefs: ['G317'],
    nodeType: 'cultural-landmark',
    requiredTerms: ['喇荣', '五明佛学院'],
    negativeTerms: ['亚青寺'],
    visualTraits: ['山谷密集红色建筑', '坛城', '经堂'],
    evidenceUrls: ['https://www.gzzsdxrmzf.gov.cn/seda/c103068/202005/164592834550404f96cbd78c34470c27.shtml'],
  }),
  benchmarkPlace({
    id: 'derge-parkhang',
    routeProfile: 'g317',
    canonicalName: '德格印经院',
    aliases: ['德格吉祥聚慧院', '德格印经院景区'],
    adminPath: ['中国', '四川省', '甘孜藏族自治州', '德格县', '更庆镇'],
    nearbyLandmarks: ['更庆寺', '德格县城'],
    roadRefs: ['G317'],
    nodeType: 'cultural-landmark',
    requiredTerms: ['德格', '印经院'],
    negativeTerms: ['拉萨印经院'],
    visualTraits: ['藏式建筑', '木刻印版', '转经廊'],
    evidenceUrls: ['https://www.dege.gov.cn/lsyg/article/157338'],
  }),
  benchmarkPlace({
    id: 'queershan-tunnel',
    routeProfile: 'g317',
    canonicalName: '雀儿山隧道',
    aliases: ['国道317线雀儿山隧道'],
    adminPath: ['中国', '四川省', '甘孜藏族自治州', '德格县'],
    nearbyLandmarks: ['雀儿山', '新路海'],
    roadRefs: ['G317'],
    nodeType: 'tunnel',
    requiredTerms: ['雀儿山隧道', 'G317'],
    negativeTerms: ['雀儿山垭口', '苗儿山隧道'],
    visualTraits: ['高海拔公路隧道', '隧道洞口', 'G317标识'],
    evidenceUrls: ['https://www.ndrc.gov.cn/fggz/zcssfz/dffz/201709/t20170930_1147709.html'],
  }),
  benchmarkPlace({
    id: 'zizhu-temple',
    routeProfile: 'g317',
    canonicalName: '孜珠寺',
    aliases: ['孜珠山孜珠寺'],
    adminPath: ['中国', '西藏自治区', '昌都市', '丁青县', '孜珠山'],
    nearbyLandmarks: ['孜珠山', '丁青县'],
    roadRefs: ['G317'],
    nodeType: 'cultural-landmark',
    requiredTerms: ['孜珠寺', '孜珠山'],
    negativeTerms: ['强巴林寺'],
    visualTraits: ['悬崖寺院', '山巅建筑群', '岩峰'],
    evidenceUrls: ['https://www.changdu.gov.cn/cdrmzf/c100677/202605/fbecb5d136c94b6393ae6e2fd431b4fd.shtml'],
  }),

  benchmarkPlace({
    id: 'genyen-eye',
    routeProfile: 'genyen-south',
    canonicalName: '格聂之眼',
    aliases: ['乃干拉托格聂之眼'],
    adminPath: ['中国', '四川省', '甘孜藏族自治州', '理塘县', '格聂镇'],
    nearbyLandmarks: ['格聂神山', '然日卡村'],
    nodeType: 'natural-landmark',
    requiredTerms: ['格聂之眼', '格聂神山'],
    negativeTerms: ['恶魔之眼'],
    visualTraits: ['圆形水塘', '草甸', '雪山背景'],
    evidenceUrls: ['https://www.gzlt.gov.cn/zrhj/article/590297'],
  }),
  benchmarkPlace({
    id: 'mount-genyen',
    routeProfile: 'genyen-south',
    canonicalName: '格聂神山',
    aliases: ['格聂山', '格聂圣山'],
    adminPath: ['中国', '四川省', '甘孜藏族自治州', '理塘县', '巴塘县'],
    nearbyLandmarks: ['冷古寺', '格聂之眼'],
    nodeType: 'natural-landmark',
    requiredTerms: ['格聂神山'],
    negativeTerms: ['贡嘎山'],
    visualTraits: ['雪峰', '高原草甸', '横断山脉'],
    evidenceUrls: ['https://www.gzlt.gov.cn/ltxrmzf/ltfg/201508/15973dd3a0464d9692d360fc9a673a49.shtml'],
  }),
  benchmarkPlace({
    id: 'lenggu-temple',
    routeProfile: 'genyen-south',
    canonicalName: '冷古寺',
    aliases: ['老冷古寺', '格聂冷古寺'],
    adminPath: ['中国', '四川省', '甘孜藏族自治州', '理塘县', '格聂镇'],
    nearbyLandmarks: ['格聂神山', '虎皮坝'],
    nodeType: 'cultural-landmark',
    requiredTerms: ['冷古寺', '格聂神山'],
    negativeTerms: ['冷谷寺'],
    visualTraits: ['雪山脚下寺院', '草甸溪流', '藏式建筑'],
    evidenceUrls: ['https://www.gzlt.gov.cn/ltfg/article/147269'],
  }),
  benchmarkPlace({
    id: 'xiazetong-village',
    routeProfile: 'genyen-south',
    canonicalName: '下则通村',
    aliases: ['则通村'],
    adminPath: ['中国', '四川省', '甘孜藏族自治州', '理塘县', '格聂镇'],
    nearbyLandmarks: ['格聂之眼', '然日卡村'],
    nodeType: 'village',
    requiredTerms: ['下则通村', '格聂南线'],
    negativeTerms: [],
    visualTraits: ['高原村落', '碎石道路', '草甸'],
    evidenceUrls: ['https://club.m.autohome.com.cn/bbs/thread/e3dbffbc780c01d8/92758300-1.html'],
  }),
  benchmarkPlace({
    id: 'reti-valley',
    routeProfile: 'genyen-south',
    canonicalName: '热梯河谷',
    aliases: ['热梯沟'],
    adminPath: ['中国', '四川省', '甘孜藏族自治州', '理塘县', '巴塘县'],
    nearbyLandmarks: ['则巴村', '格木村'],
    nodeType: 'natural-landmark',
    requiredTerms: ['热梯河谷', '格聂南线'],
    negativeTerms: [],
    visualTraits: ['蜿蜒溪流', '宽谷草甸', '雪山远景'],
    evidenceUrls: ['https://club.m.autohome.com.cn/bbs/thread/e3dbffbc780c01d8/92758300-1.html'],
  }),

  benchmarkPlace({
    id: 'chengdu-museum',
    routeProfile: 'chengdu-city',
    canonicalName: '成都博物馆',
    aliases: ['成都博物馆新馆'],
    adminPath: ['中国', '四川省', '成都市', '青羊区', '天府广场'],
    nearbyLandmarks: ['天府广场', '四川省图书馆'],
    nodeType: 'urban-landmark',
    requiredTerms: ['成都博物馆', '天府广场'],
    negativeTerms: ['四川博物院'],
    visualTraits: ['金色立面', '现代博物馆建筑', '天府广场'],
    evidenceUrls: ['https://www.cdmuseum.com/jianjie.html'],
  }),
  benchmarkPlace({
    id: 'chengdu-wuhou-shrine-museum',
    routeProfile: 'chengdu-city',
    canonicalName: '成都武侯祠博物馆',
    aliases: ['成都武侯祠', '武侯祠博物馆'],
    adminPath: ['中国', '四川省', '成都市', '武侯区', '武侯祠大街'],
    nearbyLandmarks: ['汉昭烈庙', '惠陵', '锦里'],
    nodeType: 'cultural-landmark',
    requiredTerms: ['成都', '武侯祠'],
    negativeTerms: ['南阳武侯祠'],
    visualTraits: ['红墙竹影', '汉昭烈庙', '古建筑'],
    evidenceUrls: ['https://www.wuhouci.net.cn/index.html'],
  }),
  benchmarkPlace({
    id: 'chengdu-dufu-thatched-cottage-museum',
    routeProfile: 'chengdu-city',
    canonicalName: '成都杜甫草堂博物馆',
    aliases: ['杜甫草堂', '成都杜甫草堂'],
    adminPath: ['中国', '四川省', '成都市', '青羊区', '青华路'],
    nearbyLandmarks: ['浣花溪公园', '四川博物院'],
    nodeType: 'cultural-landmark',
    requiredTerms: ['成都', '杜甫草堂'],
    negativeTerms: ['杜甫江阁'],
    visualTraits: ['中式园林', '茅屋', '少陵草堂碑亭'],
    evidenceUrls: ['https://www.cddfct.cn/'],
  }),
  benchmarkPlace({
    id: 'dongjiao-memory',
    routeProfile: 'chengdu-city',
    canonicalName: '东郊记忆',
    aliases: ['成都东郊记忆', '成都东区音乐公园'],
    adminPath: ['中国', '四川省', '成都市', '成华区', '建设南路'],
    nearbyLandmarks: ['成都传媒集团', '杉板桥'],
    nodeType: 'urban-landmark',
    requiredTerms: ['东郊记忆', '成都'],
    negativeTerms: [],
    visualTraits: ['工业遗产', '红砖厂房', '烟囱', '文化创意园区'],
    evidenceUrls: ['https://www.cmgchengdu.com/content-25-2449-1.html'],
  }),
  benchmarkPlace({
    id: 'chunxi-road',
    routeProfile: 'chengdu-city',
    canonicalName: '春熙路',
    aliases: ['成都春熙路', '春熙路步行街'],
    adminPath: ['中国', '四川省', '成都市', '锦江区'],
    nearbyLandmarks: ['太古里', '成都IFS', '总府路'],
    nodeType: 'commercial-district',
    requiredTerms: ['春熙路', '成都'],
    negativeTerms: [],
    visualTraits: ['步行街', '商业街区', '城市人流'],
    evidenceUrls: ['https://zh.wikipedia.org/wiki/%E6%98%A5%E7%86%99%E8%B7%AF'],
  }),
])

function isValidEvidenceUrl(value) {
  if (value.startsWith('docs/')) {
    const segments = value.split('/')
    return !value.includes('\\')
      && segments.length > 1
      && segments.slice(1).every((segment) => segment && segment !== '.' && segment !== '..')
  }

  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

function hasValidCoordinates(coordinates) {
  return coordinates !== null
    && typeof coordinates === 'object'
    && !Array.isArray(coordinates)
    && Number.isFinite(coordinates.lng)
    && Number.isFinite(coordinates.lat)
    && coordinates.lng >= -180
    && coordinates.lng <= 180
    && coordinates.lat >= -90
    && coordinates.lat <= 90
}

export function validateBenchmarkPlaces(places) {
  if (!Array.isArray(places)) return ['places must be an array']

  const errors = []
  const ids = new Set()

  places.forEach((place, index) => {
    const label = `record ${index}`
    const record = place !== null && typeof place === 'object' && !Array.isArray(place) ? place : {}
    if (record !== place) errors.push(`${label}: record must be an object`)

    const id = typeof record.id === 'string' ? record.id.trim() : ''

    if (!id) {
      errors.push(`${label}: missing id`)
    } else if (ids.has(id)) {
      errors.push(`${label}: duplicate id "${id}"`)
    } else {
      ids.add(id)
    }

    for (const field of ['routeProfile', 'canonicalName', 'nodeType']) {
      if (typeof record[field] !== 'string' || !record[field].trim()) {
        errors.push(`${label}: missing ${field}`)
      }
    }

    if (typeof record.routeProfile === 'string' && record.routeProfile.trim() && !ROUTE_PROFILES.has(record.routeProfile)) {
      errors.push(`${label}: unsupported routeProfile "${record.routeProfile}"`)
    }
    if (typeof record.nodeType === 'string' && record.nodeType.trim() && !NODE_TYPES.has(record.nodeType)) {
      errors.push(`${label}: unsupported nodeType "${record.nodeType}"`)
    }

    for (const field of LIST_FIELDS) {
      const values = record[field]
      if (!Array.isArray(values)) {
        errors.push(`${label}: ${field} must be an array`)
        continue
      }

      if (NON_EMPTY_LIST_FIELDS.has(field) && values.length === 0) {
        errors.push(`${label}: ${field} must be non-empty`)
      }

      values.forEach((value, valueIndex) => {
        if (typeof value !== 'string' || !value.trim()) {
          errors.push(`${label}: ${field}[${valueIndex}] must be a non-blank string`)
        } else if (field === 'evidenceUrls' && !isValidEvidenceUrl(value)) {
          errors.push(`${label}: evidenceUrls[${valueIndex}] must be an http/https URL or local docs/ path`)
        }
      })
    }

    if (record.coordinates !== null && !hasValidCoordinates(record.coordinates)) {
      errors.push(`${label}: coordinates must be null or finite longitude/latitude within valid ranges`)
    }

    if (record.nodeType === 'road-node') {
      if (!hasValidCoordinates(record.coordinates)) errors.push(`${label}: road-node requires non-null coordinates`)
      if (!Array.isArray(record.roadRefs) || record.roadRefs.length === 0) {
        errors.push(`${label}: road-node requires roadRefs`)
      }
    }
  })

  return errors
}
