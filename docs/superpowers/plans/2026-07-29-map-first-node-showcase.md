# Map-First Node Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the circular/fullscreen node reveal with five deterministic, map-first documentary layouts while keeping AI output constrained to story semantics.

**Architecture:** The LLM describes the narration structure only. A pure local layout resolver chooses a safe preset from projected map geometry, image count, and recent preset history. `FlightPlayer` delegates the visible node layer to a focused `MapNodeShowcase` component; the map remains underneath and visible throughout.

**Tech Stack:** Vue 3 `<script setup>`, Pinia, MapLibre GL, Vitest, Express, CSS transforms/opacity.

---

## 给非技术读者的名词说明

- **语义配置**：AI 只说“这是连续讲故事、并列介绍还是单一重点”，不直接控制画面坐标。
- **布局解析器**：一段本地规则程序，像排版编辑一样，从五个固定模板里挑一个不会遮住地图的方案。
- **保护区**：节点和路线周围禁止放图片的范围。
- **降级**：遇到图片缺失或 AI 出错时，自动换成更简单但一定能正常播放的方案。
- **迁移**：把旧节点保存的数据转换成新格式，用户不需要重新创建路线。
- **纯函数**：只根据输入计算输出、不直接改页面的代码，因此容易自动测试。

## 文件结构

- Create `src/utils/showcaseStory.js`：清洗 AI 语义配置并迁移旧编排。
- Create `src/utils/showcaseStory.test.js`：验证非法 AI 输出和旧配置迁移。
- Create `src/utils/mapShowcaseLayout.js`：从五种预设中选择安全布局。
- Create `src/utils/mapShowcaseLayout.test.js`：验证保护区、地图占比、防重复和确定性。
- Create `src/components/MapNodeShowcase.vue`：渲染地图上方的节点名称、海拔、图片素材轨和文字。
- Modify `server/choreography.js`：将 AI 提示词改为只输出故事语义。
- Modify `server/choreography.test.js`：固定新 JSON 契约。
- Modify `src/stores/studio.js`：保存 schema v2 配置并保留部分成功/失败状态。
- Modify `src/stores/studio.test.js`：验证新配置保存和失败状态。
- Modify `src/utils/flightTimeline.js`：用进入、旁白、退出进度替换圆形揭幕进度。
- Modify `src/utils/flightTimeline.test.js`：固定新时间轴契约和安全节点镜头。
- Modify `src/components/FlightPlayer.vue`：删除圆形/fullscreen 展示，接入新组件和布局解析器。
- Delete `src/utils/showcaseTransition.js`：删除旧遮罩与转场编译器。
- Delete `src/utils/showcaseTransition.test.js`：删除只服务旧揭幕的测试。
- Modify `CHANGELOG.md`：记录用户可见变化。

### Task 1: AI 语义配置与旧数据迁移

**用户可见变化：** 即使节点保存的是旧转场数据，也不会再触发圆形揭幕；AI 返回异常内容时仍能正常展示。

**Files:**
- Create: `src/utils/showcaseStory.js`
- Create: `src/utils/showcaseStory.test.js`

- [ ] **Step 1: Write failing tests for schema v2 normalization**

```js
import { describe, expect, it } from 'vitest'
import { defaultShowcaseStory, normalizeShowcaseStory } from './showcaseStory'

it('只保留受控的讲解语义', () => {
  expect(normalizeShowcaseStory({
    schemaVersion: 2,
    storyMode: 'parallel',
    imageOrder: [2, 0, 99, 2],
    beats: [{ at: 0.8, focus: 0 }, { at: -1, focus: 2 }],
    emphasis: 'altitude',
    css: 'position:fixed',
  }, 3)).toEqual({
    schemaVersion: 2,
    storyMode: 'parallel',
    imageOrder: [2, 0, 1],
    beats: [{ at: 0, focus: 2 }, { at: 0.8, focus: 0 }],
    emphasis: 'altitude',
  })
})

it('把旧 phases 转成新 beats 并忽略旧 transition', () => {
  const result = normalizeShowcaseStory({
    phases: [{ at: 0, focus: 1 }, { at: 0.6, focus: 0 }],
    transition: { enter: 'route-bloom', layout: 'hero-image' },
  }, 2)
  expect(result.schemaVersion).toBe(2)
  expect(result.beats).toEqual([{ at: 0, focus: 1 }, { at: 0.6, focus: 0 }])
  expect(result).not.toHaveProperty('transition')
})

it('无效输入回退到确定性的默认配置', () => {
  expect(normalizeShowcaseStory(null, 1)).toEqual(defaultShowcaseStory(1))
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --run src/utils/showcaseStory.test.js`  
Expected: FAIL because `showcaseStory.js` does not exist.

- [ ] **Step 3: Implement the restricted schema**

```js
const STORY_MODES = ['sequential', 'parallel', 'hero']
const EMPHASIS = ['name', 'altitude', 'route', 'scenery']

export function defaultShowcaseStory(imageCount) {
  const count = Math.max(0, imageCount | 0)
  const storyMode = count <= 1 ? 'hero' : 'sequential'
  const imageOrder = Array.from({ length: count }, (_, i) => i)
  return {
    schemaVersion: 2,
    storyMode,
    imageOrder,
    beats: imageOrder.map((focus, i) => ({ at: i / Math.max(1, count), focus })),
    emphasis: 'name',
  }
}

export function normalizeShowcaseStory(raw, imageCount) {
  // Accept schema v2 or legacy phases, remove unknown fields, clamp beats,
  // de-duplicate image indices, append omitted valid indices, and force first at=0.
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- --run src/utils/showcaseStory.test.js`  
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/showcaseStory.js src/utils/showcaseStory.test.js
git commit -m "feat(showcase): normalize constrained story semantics"
```

### Task 2: 五种安全地图预设解析器

**用户可见变化：** 图片可以出现在上、下、左、右或单图侧轨，但程序会先检查节点和路线，不合适就自动换边。

**Files:**
- Create: `src/utils/mapShowcaseLayout.js`
- Create: `src/utils/mapShowcaseLayout.test.js`

- [ ] **Step 1: Write failing tests for preset selection**

```js
import { describe, expect, it } from 'vitest'
import { resolveMapShowcaseLayout } from './mapShowcaseLayout'

const viewport = { width: 1000, height: 600 }
const base = {
  viewport,
  nodePoint: { x: 500, y: 300 },
  routePoints: [{ x: 120, y: 300 }, { x: 500, y: 300 }, { x: 850, y: 260 }],
  recentPresetIds: [],
  dayPresetCounts: {},
}

it('并列三图从上下胶片带中选择', () => {
  const result = resolveMapShowcaseLayout({
    ...base,
    story: { storyMode: 'parallel', imageOrder: [0, 1, 2], beats: [] },
    imageCount: 3,
  })
  expect(['top-filmstrip', 'bottom-filmstrip']).toContain(result.presetId)
})

it('路线占据底部时不选底部胶片带', () => {
  const result = resolveMapShowcaseLayout({
    ...base,
    routePoints: [{ x: 0, y: 540 }, { x: 1000, y: 540 }],
    story: { storyMode: 'parallel', imageOrder: [0, 1, 2], beats: [] },
    imageCount: 3,
  })
  expect(result.presetId).not.toBe('bottom-filmstrip')
})

it('相邻节点避免重复同一预设', () => {
  const result = resolveMapShowcaseLayout({
    ...base,
    recentPresetIds: ['right-rail'],
    story: { storyMode: 'sequential', imageOrder: [0, 1, 2], beats: [] },
    imageCount: 3,
  })
  expect(result.presetId).not.toBe('right-rail')
})

it('没有安全图片区时退回纯地图信息', () => {
  const result = resolveMapShowcaseLayout({
    ...base,
    nodePoint: { x: 80, y: 80 },
    routePoints: [
      { x: 0, y: 80 }, { x: 1000, y: 80 },
      { x: 80, y: 0 }, { x: 80, y: 600 },
      { x: 0, y: 540 }, { x: 1000, y: 540 },
    ],
    story: { storyMode: 'parallel', imageOrder: [0, 1, 2], beats: [] },
    imageCount: 3,
  })
  expect(result.presetId).toBe('map-only')
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --run src/utils/mapShowcaseLayout.test.js`  
Expected: FAIL because the resolver does not exist.

- [ ] **Step 3: Implement layout geometry and safety scoring**

```js
export const PRESET_IDS = [
  'right-rail', 'left-rail', 'top-filmstrip', 'bottom-filmstrip', 'feature-rail',
]

export function resolveMapShowcaseLayout(input) {
  // Build candidate panel rectangles as viewport percentages.
  // Reject candidates intersecting the 72px node radius or 24px route corridor.
  // Reject candidates covering more than 35% of the viewport.
  // Rank compatible presets by storyMode, imageCount, recent-use penalty,
  // day count, and stable input order. Return map-only if none passes.
}
```

The compiled result must include:

```js
{
  presetId: 'right-rail',
  panel: { xPct: 69, yPct: 0, widthPct: 31, heightPct: 100 },
  slots: [{ xPct: 74, yPct: 5, widthPct: 22, heightPct: 24 }],
  identity: { xPct: 4, yPct: 6, align: 'left' },
  mapTarget: { xPct: 42, yPct: 50 },
  imageOrder: [0, 1, 2],
  beats: []
}
```

- [ ] **Step 4: Run focused tests and refactor duplicated geometry**

Run: `npm test -- --run src/utils/mapShowcaseLayout.test.js`  
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/mapShowcaseLayout.js src/utils/mapShowcaseLayout.test.js
git commit -m "feat(showcase): resolve safe map-first presets"
```

### Task 3: 时间轴改为普通进入/退出进度与安全节点镜头

**用户可见变化：** 小车到站后地图平滑居中，讲解层淡入；不再计算一个逐渐扩大的圆。

**Files:**
- Modify: `src/utils/flightTimeline.js`
- Modify: `src/utils/flightTimeline.test.js`

- [ ] **Step 1: Replace reveal expectations with enter/exit expectations**

```js
it('dwell 输出进入、旁白和退出进度，不再输出 revealFrac', () => {
  const start = timeline.scenes.find((s) => s.kind === 'dwell').start
  const entering = sampleAt(timeline, start + 0.35)
  expect(entering.showcase.enterFrac).toBeCloseTo(0.5)
  expect(entering.showcase.exitFrac).toBe(0)
  expect(entering.showcase).not.toHaveProperty('revealFrac')
})

it('节点镜头固定使用安全缩放且平滑居中', () => {
  const dwell = sampleAt(timeline, dwellStart + 0.1)
  expect(dwell.camera.center).toEqual(stops[0].point)
  expect(dwell.camera.zoom).toBeLessThanOrEqual(10.2)
  expect(dwell.camera.easeMs).toBeGreaterThanOrEqual(2400)
})
```

- [ ] **Step 2: Run timeline tests and verify RED**

Run: `npm test -- --run src/utils/flightTimeline.test.js`  
Expected: FAIL on old `revealFrac` and bounds-camera contract.

- [ ] **Step 3: Implement the new dwell sample**

```js
const enterFrac = clamp01((tc - scene.start) / o.showcaseEnterDuration)
const exitStart = scene.end - o.showcaseExitDuration
const exitFrac = clamp01((tc - exitStart) / o.showcaseExitDuration)

return {
  camera: {
    center: scene.stop.point,
    zoom: o.showcaseZoom,
    pitch: o.overviewPitch,
    bearing: 0,
    easeMs: o.showcaseCameraEaseMs,
  },
  showcase: { stopIndex: i, imageIndex, enterFrac, narrationFrac, exitFrac },
}
```

Defaults:

```js
showcaseEnterDuration: 0.7,
showcaseExitDuration: 0.5,
showcaseZoom: 10.2,
showcaseCameraEaseMs: 2800,
```

- [ ] **Step 4: Run timeline and store tests**

Run: `npm test -- --run src/utils/flightTimeline.test.js src/stores/flight.test.js`  
Expected: all tests PASS after updating only assertions tied to the new contract.

- [ ] **Step 5: Commit**

```bash
git add src/utils/flightTimeline.js src/utils/flightTimeline.test.js src/stores/flight.test.js
git commit -m "feat(flight): center node with map-first showcase timing"
```

### Task 4: AI 提示词和工作室保存 schema v2

**用户可见变化：** “AI 编排动效”只分析讲解结构；成功、部分成功和失败仍明确显示，不会因模型随意返回动画词而破坏画面。

**Files:**
- Modify: `server/choreography.js`
- Modify: `server/choreography.test.js`
- Modify: `src/stores/studio.js`
- Modify: `src/stores/studio.test.js`

- [ ] **Step 1: Write failing server-contract tests**

```js
it('提示词只允许故事语义，不允许布局和 CSS', async () => {
  await generate({ nodes: [{ index: 0, imageCount: 3, narration: '先看垭口，再看经幡' }] })
  const system = callLLM.mock.calls[0][0].messages[0].content
  expect(system).toContain('storyMode')
  expect(system).toContain('imageOrder')
  expect(system).toContain('beats')
  expect(system).toContain('不得输出具体坐标、预设名称、CSS')
  expect(system).not.toContain('route-bloom')
})
```

- [ ] **Step 2: Write failing store tests for v2 persistence**

```js
it('保存清洗后的 schema v2 配置', async () => {
  generateChoreographyConfigs.mockResolvedValue([{
    index: 0,
    config: { storyMode: 'hero', imageOrder: [0], beats: [{ at: 0, focus: 0 }] },
  }])
  await studio.runChoreographyAll('key', { force: true })
  expect(trip.plan.days[0].waypoints[0].choreography.config.schemaVersion).toBe(2)
})
```

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm test -- --run server/choreography.test.js src/stores/studio.test.js`  
Expected: FAIL because the prompt and normalizer still use old transition vocabulary.

- [ ] **Step 4: Update prompt and store normalizer**

Use `normalizeShowcaseStory` in the studio store. The server format becomes:

```json
{
  "results": [{
    "index": 0,
    "config": {
      "schemaVersion": 2,
      "storyMode": "sequential",
      "imageOrder": [0, 1, 2],
      "beats": [{"at": 0, "focus": 0}],
      "emphasis": "name"
    }
  }]
}
```

- [ ] **Step 5: Run focused tests**

Run: `npm test -- --run server/choreography.test.js src/stores/studio.test.js`  
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/choreography.js server/choreography.test.js src/stores/studio.js src/stores/studio.test.js
git commit -m "feat(ai): constrain showcase planning to story semantics"
```

### Task 5: 独立地图节点讲解组件

**用户可见变化：** 五种预设真正显示在地图上方；名称和海拔突出，图片只占边缘素材区。

**Files:**
- Create: `src/components/MapNodeShowcase.vue`
- Modify: `src/components/FlightPlayer.vue`

- [ ] **Step 1: Build the focused component contract**

```vue
<script setup>
const props = defineProps({
  node: { type: Object, default: null },
  images: { type: Array, default: () => [] },
  layout: { type: Object, required: true },
  enterFrac: { type: Number, default: 0 },
  narrationFrac: { type: Number, default: 0 },
  exitFrac: { type: Number, default: 0 },
  stopIndex: { type: Number, required: true },
  stopCount: { type: Number, required: true },
  reducedMotion: { type: Boolean, default: false },
})
</script>
```

Render:

- a limited-area panel for the selected preset;
- image slots from `layout.slots`;
- focus state from the last beat whose `at <= narrationFrac`;
- node name, topographic altitude datum, address and short narration;
- no fullscreen background, clip path, continuous drift, or Ken Burns scaling.

- [ ] **Step 2: Add preset-specific CSS**

Use one restrained entrance:

```css
.map-showcase-item {
  opacity: var(--item-opacity);
  transform: translate3d(var(--item-x), var(--item-y), 0);
  transition: filter 600ms cubic-bezier(.22,1,.36,1),
              opacity 500ms cubic-bezier(.22,1,.36,1),
              transform 600ms cubic-bezier(.22,1,.36,1);
}
```

The component must never render an `absolute inset-0` opaque backdrop.

- [ ] **Step 3: Replace old FlightPlayer showcase path**

In `FlightPlayer.vue`:

- remove `compileShowcaseTransition`, `wipeOrigin`, `holdClosingReveal`, fullbleed, scattered-card and pulse logic;
- project the current node and sampled incoming/outgoing route points;
- call `resolveMapShowcaseLayout`;
- render `<MapNodeShowcase>` as a transparent overlay above the map;
- keep controls above the component;
- recompute layout on stop change and resize.

- [ ] **Step 4: Delete old transition compiler**

```bash
git rm src/utils/showcaseTransition.js src/utils/showcaseTransition.test.js
```

- [ ] **Step 5: Run component-adjacent tests and build**

Run: `npm test -- --run src/utils/mapShowcaseLayout.test.js src/utils/flightTimeline.test.js`  
Expected: PASS.

Run: `npm run build`  
Expected: Vite build succeeds; the existing chunk-size warning is allowed.

- [ ] **Step 6: Commit**

```bash
git add src/components/MapNodeShowcase.vue src/components/FlightPlayer.vue
git add -u src/utils/showcaseTransition.js src/utils/showcaseTransition.test.js
git commit -m "feat(player): replace reveal with map-first node presets"
```

### Task 6: Full regression, documentation, and manual handoff

**用户可见变化：** 项目形成可体验版本，并提供从正确文件夹启动和逐项验收的方法。

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add release notes**

Record:

- circular/fullscreen node reveal removed;
- five map-first presets added;
- node name and altitude hierarchy strengthened;
- AI now returns constrained story semantics;
- old configurations safely migrate.

- [ ] **Step 2: Run the complete automated suite**

Run: `npm test -- --run`  
Expected: all test files and tests PASS with zero failures.

- [ ] **Step 3: Run production build**

Run: `npm run build`  
Expected: build succeeds; only the known chunk-size advisory may remain.

- [ ] **Step 4: Inspect for forbidden old paths**

Run:

```powershell
Get-ChildItem src -Recurse -File |
  Select-String -Pattern 'route-bloom|clipPath.*circle|showcaseTransition|fullbleed'
```

Expected: no runtime references; historical documentation may still mention them.

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: record map-first node showcase"
```

- [ ] **Step 6: Manual test from the feature worktree**

Start from:

```text
E:\git-workspace\repos\318\.worktrees\codex-showcase-transitions
```

Run `npm run dev`, then verify:

1. Run “AI 编排动效（有旁白节点）”.
2. Open flight preview.
3. Confirm map and route remain visible at every narrated stop.
4. Confirm left, right, top, bottom, and single-image presets appear across the route.
5. Confirm node name and altitude are prominent.
6. Confirm no circular reveal or fullscreen image appears.
7. Scrub backward and forward and confirm layout remains stable.
8. Check same-coordinate day boundaries and high-altitude nodes for camera diving.
