# Showcase Motion Grammar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the universal circular reveal with AI-selected, deterministic showcase transitions and layouts, while retaining route-bloom as a safe legacy fallback.

**Architecture:** The choreography JSON gains a strictly normalized `transition` object. The server may suggest only values from the fixed motion grammar; shared pure utilities normalize and degrade unsupported combinations based on image availability and reduced-motion preferences. `FlightPlayer` renders the selected scene transition from `showcase.revealFrac`, while the existing route-bloom circle remains the fallback for old, invalid, or failed configurations. Studio can generate choreography for every narrated node, including text-only stops.

**Tech Stack:** Vue 3, Pinia, Vite/Vitest, Express, existing DeepSeek-compatible choreography endpoint, MapLibre projection data.

---

## Scope and invariants

- Keep all map camera, car, route-progress, narration, tile-readiness, and audio timing behavior unchanged.
- Never allow model-produced CSS, JavaScript, class names, or arbitrary animation names into the client.
- A malformed response must render a known-safe route-bloom transition, not a blank showcase.
- `prefers-reduced-motion` must collapse every non-essential entry/exit motion to a soft dissolve.
- Existing choreography records without `transition` must remain valid and render as route-bloom; this provides backward compatibility for saved IndexedDB data.
- The full-screen showcase root must no longer always receive a circle `clip-path`.

## Task 1: Stop Vitest collecting nested worktree test suites

**Files:**
- Modify: `vite.config.js`

- [ ] Write the failing/reproduction command from the repository root:

  ```powershell
  npm test -- --run
  ```

  Before the change, the root repository may report duplicated tests because `.worktrees/<name>/src/**/*.test.js` is discovered recursively. Record the output count in the task notes; do not treat it as the source-suite baseline.

- [ ] Update `vite.config.js` to preserve Vitest defaults and explicitly exclude nested worktrees:

  ```js
  import { defineConfig } from 'vite'
  import vue from '@vitejs/plugin-vue'
  import { configDefaults } from 'vitest/config'

  export default defineConfig({
    plugins: [vue()],
    server: { proxy: { '/api': 'http://localhost:8787' } },
    test: {
      environment: 'node',
      globals: true,
      exclude: [
        ...configDefaults.exclude,
        '**/.worktrees/**',
        '**/worktrees/**',
      ],
    },
  })
  ```

- [ ] Verify from both the primary repository and this isolated worktree that the discovered test-file count is identical (the clean-worktree baseline is 35 files / 340 tests before this feature work).

- [ ] Commit:

  ```text
  test: exclude nested worktrees from Vitest discovery
  ```

## Task 2: Extend the persisted choreography contract with a safe motion grammar

**Files:**
- Modify: `src/utils/choreography.js`
- Modify: `src/utils/choreography.test.js`

- [ ] Add failing unit tests first for the complete public contract:

  ```js
  import {
    defaultChoreography,
    normalizeChoreography,
    compileChoreography,
  } from './choreography.js'

  it('新默认编排带完整转场语法', () => {
    expect(defaultChoreography(2).transition).toEqual({
      enter: 'photo-cascade',
      anchor: 'route-end',
      direction: 'forward',
      energy: 'medium',
      layout: 'scattered-cards',
      exit: 'follow-route',
    })
  })

  it('旧编排缺少 transition 时回退路线绽放', () => {
    expect(normalizeChoreography({ tempo: 'calm', phases: [], idle: {} }, 2).transition.enter)
      .toBe('route-bloom')
  })

  it('非法转场字段逐项回退且不接受任意字符串', () => {
    const c = normalizeChoreography({
      transition: {
        enter: 'eval(alert(1))', anchor: 'elsewhere', direction: 'diagonal',
        energy: 'turbo', layout: 'wallpaper', exit: 'teleport',
      },
    }, 2)
    expect(c.transition).toEqual({
      enter: 'route-bloom', anchor: 'route-end', direction: 'forward',
      energy: 'medium', layout: 'scattered-cards', exit: 'return-map',
    })
  })

  it('无图和单图节点会降级不可执行的编排', () => {
    expect(normalizeChoreography({
      transition: { enter: 'photo-cascade', anchor: 'image-focus', layout: 'sequential-cards' },
    }, 0).transition).toMatchObject({
      enter: 'directional-wipe', anchor: 'route-end', layout: 'text-first',
    })
    expect(normalizeChoreography({
      transition: { enter: 'layer-unfold', layout: 'scattered-cards' },
    }, 1).transition.layout).toBe('hero-image')
  })

  it('compileChoreography 在零图时仍携带转场配置', () => {
    expect(compileChoreography({ transition: { enter: 'chapter-slide' } }, {
      imageCount: 0, seed: 1,
    })).toMatchObject({ mode: 'none', transition: { enter: 'chapter-slide' } })
  })
  ```

- [ ] Implement whitelists in `src/utils/choreography.js`:

  ```js
  const ENTERS = ['route-bloom', 'directional-wipe', 'photo-cascade', 'soft-dissolve', 'layer-unfold', 'chapter-slide']
  const ANCHORS = ['route-end', 'screen-center', 'image-focus']
  const DIRECTIONS = ['forward', 'left', 'right', 'up', 'down']
  const ENERGIES = ['calm', 'medium', 'accent']
  const LAYOUTS = ['text-first', 'hero-image', 'scattered-cards', 'sequential-cards']
  const EXITS = ['return-map', 'follow-route', 'soft-dissolve']
  ```

  Add private `oneOf(value, allowed, fallback)` and `defaultTransition(imageCount)` helpers. A fresh default should be:

  - 0 images: `directional-wipe`, `route-end`, `forward`, `medium`, `text-first`, `follow-route`.
  - 1 image: `photo-cascade`, `image-focus`, `forward`, `medium`, `hero-image`, `follow-route`.
  - 2+ images: `photo-cascade`, `route-end`, `forward`, `medium`, `scattered-cards`, `follow-route`.

  `normalizeChoreography(raw, imageCount)` must use `route-bloom` as its transition fallback only when a saved `raw` object lacks `transition` or supplies an invalid `transition` object. That preserves old records. It must normalize each allowed field independently, then apply these capability rules:

  - zero images: `image-focus` becomes `route-end`; `photo-cascade` becomes `directional-wipe`; `hero-image`, `scattered-cards`, and `sequential-cards` become `text-first`.
  - one image: multi-card layouts become `hero-image`; `layer-unfold` becomes `photo-cascade`.
  - `layer-unfold` with fewer than two images becomes `photo-cascade` (then the zero-image rule above may further reduce it).

  Make `defaultChoreography(imageCount)` include a fresh default transition. Normalize before the zero-image early return in `compileChoreography`, and include `transition: cfg.transition` in all three compile modes (`none`, `fullbleed`, and `cards`). Keep existing deterministic card layout behavior unchanged.

- [ ] Run the focused tests, then the full suite.

- [ ] Commit:

  ```text
  feat(choreography): add normalized showcase motion grammar
  ```

## Task 3: Constrain the LLM choreography endpoint to the new grammar

**Files:**
- Modify: `server/choreography.js`
- Modify: `server/choreography.test.js`

- [ ] Add failing tests asserting that the system prompt contains every allowed transition vocabulary value and that a response with `transition` is passed through as plain data for client normalization:

  ```js
  expect(callLLM.mock.calls[0][0].messages[0].content)
    .toContain('route-bloom')
  expect(callLLM.mock.calls[0][0].messages[0].content)
    .toContain('chapter-slide')
  expect(result[0].config.transition).toEqual({
    enter: 'layer-unfold', anchor: 'image-focus', direction: 'up',
    energy: 'accent', layout: 'sequential-cards', exit: 'soft-dissolve',
  })
  ```

- [ ] Extend the system prompt in `server/choreography.js` so its JSON example is:

  ```json
  {
    "nodeId": "day1-node1",
    "config": {
      "tempo": "medium",
      "transition": {
        "enter": "photo-cascade",
        "anchor": "route-end",
        "direction": "forward",
        "energy": "medium",
        "layout": "scattered-cards",
        "exit": "follow-route"
      },
      "phases": [{ "at": 0, "focus": 0, "accent": "none" }],
      "idle": { "drift": 0.4, "breathe": 0.3 }
    }
  }
  ```

  Explain the semantic constraints in the prompt: `route-bloom` is appropriate for map/road geography; `photo-cascade` and `layer-unfold` require images; `text-first` is for text-only stops; `forward` means the next route direction; `calm` favors `soft-dissolve`; and the model must select only literal values in the provided lists. Keep the existing “JSON only, no explanation” instruction.

- [ ] Keep server behavior defensive: do not trust or execute returned values; it returns raw JSON, while `normalizeChoreography` remains the final authority in the client.

- [ ] Run `server/choreography.test.js` and the full suite.

- [ ] Commit:

  ```text
  feat(server): prompt choreography model with motion grammar
  ```

## Task 4: Make every narrated stop eligible for choreography generation

**Files:**
- Modify: `src/stores/studio.js`
- Modify: `src/stores/studio.test.js`
- Modify: `src/views/StudioView.vue`

- [ ] Add failing store tests for a narrated content node with zero images. The request payload must include `{ imageCount: 0 }`, and a returned configuration must be persisted through `trip.setChoreography`.

- [ ] Update `nodesForChoreography()` in `src/stores/studio.js` to include every content node with non-empty plain narration. Do not require `w.images?.length`:

  ```js
  if (!plain) return
  return {
    nodeId: w.id,
    narration: plain.slice(0, CHOREO_NARRATION_MAX),
    imageCount: w.images?.length ?? 0,
    narrationHash: hashKey(plain),
    dayNumber,
    index,
  }
  ```

  Keep existing idempotency semantics: a matching narration hash is skipped, while `force: true` regenerates candidates. Missing LLM results must still persist `defaultChoreography(candidate.imageCount)` so no narrated stop is left with an undefined visual plan.

- [ ] Change Studio wording and eligibility count from “有图节点” to “有旁白节点”:

  ```vue
  AI 编排动效（有旁白节点）
  ```

  The progress copy must continue to distinguish configured vs. skipped vs. failed results; do not mark a failed job as success.

- [ ] Run focused studio tests, then the full suite and production build.

- [ ] Commit:

  ```text
  feat(studio): choreograph text-only narrated stops
  ```

## Task 5: Add a pure renderer-facing transition compiler

**Files:**
- Create: `src/utils/showcaseTransition.js`
- Create: `src/utils/showcaseTransition.test.js`

- [ ] Create tests before implementation. The utility must accept only already-normalized transition data and simple scalar inputs, so it remains testable in Vitest’s Node environment:

  ```js
  import { compileShowcaseTransition } from './showcaseTransition.js'

  const origin = { x: 100, y: 80, maxR: 400 }

  it('路线绽放才输出圆形 clip-path', () => {
    expect(compileShowcaseTransition({
      transition: { enter: 'route-bloom', direction: 'forward', energy: 'medium' },
      revealFrac: 0.5, origin,
    }).style.clipPath).toBe('circle(200px at 100px 80px)')
  })

  it('方向擦拭不输出圆形 clip-path，并按方向收放', () => {
    const r = compileShowcaseTransition({
      transition: { enter: 'directional-wipe', direction: 'left', energy: 'medium' },
      revealFrac: 0.25, origin,
    })
    expect(r.style.clipPath).toBe('inset(0 0 0 75%)')
    expect(r.kind).toBe('directional-wipe')
  })

  it('柔和叠化与章节滑入使用有限、确定的样式值', () => {
    expect(compileShowcaseTransition({
      transition: { enter: 'soft-dissolve', direction: 'forward', energy: 'calm' },
      revealFrac: 0.4, origin,
    }).style.opacity).toBe(0.4)
    expect(compileShowcaseTransition({
      transition: { enter: 'chapter-slide', direction: 'up', energy: 'accent' },
      revealFrac: 0, origin,
    }).style.transform).toBe('translate3d(0, 18%, 0)')
  })

  it('reduced motion 将所有入口编译为叠化', () => {
    expect(compileShowcaseTransition({
      transition: { enter: 'layer-unfold', direction: 'down', energy: 'accent' },
      revealFrac: 0.5, origin, reducedMotion: true,
    }).kind).toBe('soft-dissolve')
  })
  ```

- [ ] Implement `compileShowcaseTransition({ transition, revealFrac, origin, reducedMotion })` with no DOM access and no arbitrary string interpolation. Clamp `revealFrac` to `[0, 1]`, then return `{ kind, style }` where:

  - `route-bloom`: circle `clipPath` centered on `origin`.
  - `directional-wipe`: `inset()` from the selected left/right/up/down edge; `forward` resolves to `left` in this pure helper and may be replaced by the player with a route-derived cardinal direction.
  - `soft-dissolve`: opacity equals reveal fraction.
  - `photo-cascade`: opacity plus an energy-bounded vertical translate from 12%, 16%, or 20% toward 0.
  - `layer-unfold`: opacity plus a bounded `scale(0.96..1)` and transform-origin from `anchor` resolved by the player.
  - `chapter-slide`: opacity plus a directional translate from 10%, 14%, or 18% toward 0.

  Use small lookup tables for distances and directional inset/translate values. Never return user/model-provided CSS fragments.

- [ ] Run the new focused tests and full suite.

- [ ] Commit:

  ```text
  feat(player): compile safe showcase transition styles
  ```

## Task 6: Render the selected transition and layout in FlightPlayer

**Files:**
- Modify: `src/components/FlightPlayer.vue`
- Modify: `src/utils/choreography.js` (only if a focused test identifies a missing compile field)

- [ ] Add a player-side reactive `prefersReducedMotion` ref. On mount, initialize it from `window.matchMedia('(prefers-reduced-motion: reduce)')`, subscribe to `change`, and unsubscribe in `onBeforeUnmount`. Default to `false` in non-browser test contexts.

- [ ] Import `compileShowcaseTransition`. Add `showcaseTransition` computed from:

  ```js
  compileShowcaseTransition({
    transition: compiledChoreo.value?.transition ?? {
      enter: 'route-bloom', anchor: 'route-end', direction: 'forward',
      energy: 'medium', layout: 'scattered-cards', exit: 'return-map',
    },
    revealFrac: showcase.value?.revealFrac ?? 0,
    origin: wipeOrigin.value,
    reducedMotion: prefersReducedMotion.value,
  })
  ```

  This explicit fallback is required for all saved pre-feature configurations and rendering errors. Keep `tryUpdateWipeOrigin`, tile readiness, and `holdClosingReveal` unchanged.

- [ ] Replace the unconditional showcase root binding:

  ```vue
  <div v-if="showcase && wipeStyle" class="absolute inset-0 bg-black overflow-hidden" :style="wipeStyle">
  ```

  with a semantic, inspectable root:

  ```vue
  <div
    v-if="showcase"
    class="showcase-scene absolute inset-0 bg-black overflow-hidden"
    :class="`showcase-enter-${showcaseTransition.kind}`"
    :data-transition="showcaseTransition.kind"
    :style="showcaseTransition.style"
  >
  ```

  The route-bloom branch is the only branch allowed to receive a circle clip path. This directly removes the universal-circle bug.

- [ ] Derive layout from `compiledChoreo.value.transition.layout` and rendered image count:

  - `text-first`: no hero/card image; retain dark background and readable text.
  - `hero-image`: keep current full-bleed image path and existing <=2% breathe behavior for one image.
  - `scattered-cards`: retain current deterministic upper/right scattered cards.
  - `sequential-cards`: render the same safe-zone cards but set only the focus card to full opacity/scale; non-focused cards remain present at low opacity to avoid a hard cut.

  `cardMode` must be true only for the two card layouts and at least two loaded images. If an image download is still pending or missing, use the existing loaded-image-count fallback so the scene degrades safely.

- [ ] Add scoped CSS only for renderer-owned class names:

  - `showcase-enter-photo-cascade`: card container enters with a bounded upward translation and opacity controlled by the compiler style.
  - `showcase-enter-layer-unfold`: cards use a shared 3D-safe transform origin and a small scale range; do not rotate the map or use unbounded perspective.
  - `showcase-enter-chapter-slide`: title/narration block follows the same directional scene movement with no separate animation timer.
  - `showcase-enter-soft-dissolve`: do not add any additional keyframe motion.

  Keep controls outside the showcase root and above it as they are today. Preserve `pointer-events-none` for showcase content so controls remain clickable.

- [ ] Validate by building and running the browser manually. Do not claim the Vue visual behavior is covered by Node unit tests; its decision logic is covered in Tasks 2 and 5.

- [ ] Commit:

  ```text
  feat(player): render AI-selected showcase transitions
  ```

## Task 7: Regression verification and hand-test protocol

**Files:**
- Modify: `docs/superpowers/specs/2026-07-24-showcase-transition-choreography-design.md`
- Modify: `CHANGELOG.md`

- [ ] Add an implementation note to the design spec documenting the legacy route-bloom fallback and the test-discovery exclusion.
- [ ] Add a concise unreleased changelog entry.
- [ ] Run:

  ```powershell
  npm test -- --run
  npm run build
  ```

  Run the test command from the main repository after the worktree exclusion lands; confirm nested worktree tests are not counted.

- [ ] Use this manual protocol before proposing merge:

  1. Start the app normally, open 视频工作室, and load 318 preset narration.
  2. For a text-only narrated node, run AI 编排动效 and preview: it must use a non-circular text-first directional wipe/dissolve, never disappear.
  3. For a one-image node, preview at least one `photo-cascade`/`chapter-slide` outcome: hero image stays full bleed, with no card rail requirement.
  4. For a 2+ image node, preview both `scattered-cards` and `sequential-cards` outcomes by regenerating choreography or temporarily using a stored config: cards remain out of the bottom-left text safe area, focus tracks narration, and the scene entry is not universally circular.
  5. Scrub directly into a dwell’s opening and closing edge. Confirm no black frame, wrong-origin flash, or locked controls.
  6. Toggle OS/browser reduced-motion preference, reload, and confirm entries collapse to gentle opacity changes.
  7. Replay the same stop: configuration and card layout are deterministic; only the playhead restarts its motion.
  8. Verify legacy stored choreography with no `transition` still plays as the familiar route-bloom circle instead of erroring.

- [ ] Commit:

  ```text
  docs: document showcase motion grammar verification
  ```

## Final review checklist

- [ ] Review `git diff main...HEAD --stat` and confirm no `.env`, image blobs, untracked user documents, or generated build output are staged.
- [ ] Review the grammar whitelist: there is no route from an LLM response to arbitrary CSS/JS/HTML.
- [ ] Confirm saved choreography without a `transition` field resolves to `route-bloom`.
- [ ] Confirm zero-image narrated nodes are included by Studio and remain readable.
- [ ] Confirm the test count is not multiplied by `.worktrees` discovery.
- [ ] Confirm `npm test -- --run` and `npm run build` pass immediately before handoff.
