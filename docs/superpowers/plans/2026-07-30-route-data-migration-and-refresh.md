# Route Data Migration and Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复旧版固定 318 坐标造成的异常绕路，并让用户能够真正刷新过期路线，同时保留已写旁白、配图和动效配置。

**Architecture:** 在路书进入 Pinia store 前做一次“旧数据迁移”（通俗讲：只更新已确认错误的地点坐标，不重做用户内容）；路线缓存加入版本和过期时间（通俗讲：旧路线不会永久粘住）；路线规划页重新计算时允许绕过缓存，并用当天颜色显示节点归属。

**Tech Stack:** Vue 3、Pinia、AMap JS API、IndexedDB、Vitest。

---

### Task 1: 旧版固定 318 坐标迁移

**Files:**
- Create: `src/utils/fixed318Migration.js`
- Create: `src/utils/fixed318Migration.test.js`
- Modify: `src/data/preset318.js`
- Modify: `src/stores/trip.js`
- Modify: `src/stores/trip.test.js`

- [ ] **Step 1: Write the failing migration test**

测试一个旧版路书：`东达山` 仍是旧坐标，且已有旁白、图片和动效；迁移后坐标等于当前核验坐标、当天 `segments` 清空，而内容字段保持不变。普通自定义路书不得被改动。

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- src/utils/fixed318Migration.test.js`

Expected: FAIL because `migrateFixed318Plan` does not exist.

- [ ] **Step 3: Implement the smallest migration**

给当前预设增加 `presetId` / `routeDataVersion`。迁移器仅识别名称包含 `318` 且命中多个固定主线锚点的旧路书；按 `placeId` 或精确中文名更新地点身份、坐标和来源证据，保留 `narration`、`prevNarration`、`note`、`images`、`choreography`。只要当天任一坐标变化，就把该天 `segments` 设为 `null`。

- [ ] **Step 4: Integrate through `trip.replacePlan`**

应用启动恢复和 JSON 导入都经过同一个迁移入口；store 暴露一条可显示的 `routeNotice`，说明“旧版地点坐标已更新，请重新计算驾驶路线”。

- [ ] **Step 5: Run migration/store tests and verify GREEN**

Run: `npm.cmd test -- src/utils/fixed318Migration.test.js src/stores/trip.test.js`

Expected: PASS.

### Task 2: 路线缓存版本、过期与强制刷新

**Files:**
- Modify: `src/composables/useDriving.js`
- Modify: `src/composables/useDriving.test.js`
- Modify: `src/views/PlannerView.vue`

- [ ] **Step 1: Write one failing cache behavior test**

验证同版本且未过期的缓存仍命中；旧格式、过期缓存或 `{ forceRefresh: true }` 必须重新请求高德。

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm.cmd test -- src/composables/useDriving.test.js`

Expected: FAIL because old cache has no version/expiry and no force-refresh option.

- [ ] **Step 3: Implement cache metadata and validation**

缓存 key 加 `route-v2` 前缀，缓存记录加入 `cacheVersion` 与 `cachedAt`，默认 30 天有效；返回给调用方前去掉内部缓存字段。空路径或非有限坐标不写入缓存。

- [ ] **Step 4: Make the planner button genuinely recalculate**

首次计算仍可命中有效缓存；当当前路书已经有路线时，点击按钮使用 `forceRefresh` 重新请求，不再整天跳过。计算失败仍保留旧日路线，成功后才替换。

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm.cmd test -- src/composables/useDriving.test.js`

Expected: PASS.

### Task 3: 路线归属提示与记录

**Files:**
- Modify: `src/views/PlannerView.vue`
- Modify: `docs/reference/fixed318-place-audit.md`
- Modify: `docs/product-roadmap.md`（主工作区已单独记录非主线增强）

- [ ] **Step 1: Use the existing day color for waypoint markers**

用 DOM 创建小型彩色图钉，颜色与左侧 Day 卡片一致，`title` 保留地点名；避免所有日期都显示为高德默认蓝色，造成“姊妹湖图钉被误认为东达山”。

- [ ] **Step 2: Show migration/recalculation notice**

在“计算驾驶路线”按钮下显示 `routeNotice`，路线成功重算后清除提示。

- [ ] **Step 3: Record diagnostic evidence**

记录 2026-07-30 高德诊断：旧东达山坐标导致约 74 km 绕行；当前核验坐标约 50 km。说明山区折返本身可能是真实道路，异常在于旧目的地坐标未迁移。

- [ ] **Step 4: Run full verification**

Run: `npm.cmd test`

Expected: all tests pass.

Run: `npm.cmd run build`

Expected: production build succeeds; only the existing large-chunk warning may remain.
