# 多源精准搜图基准报告

> 2026-08-12 决策记录：Brave Image Search 的正式接入因当前订阅需要 Visa 信用卡而暂缓。待具备可用支付方式时重新提醒并评估；当前继续使用已配置来源，缺少可靠图片的节点允许降级为地图＋文字，不允许用错误地点图片凑数。

- 执行时间：2026-08-08T09:58:01.398Z
- 启用来源：commons、openverse、pixabay
- 跳过来源：brave、commons、mapillary、openverse
- 失败来源：无

## 摘要

| 指标 | 数值 |
|---|---:|
| 节点数 | 20 |
| 精准/待确认/已拒绝 | 0/1/487 |
| 可直接使用/仅发现候选 | 0/0 |
| 首张精准图片时间(ms) | 无 |
| 达到三张精准图片时间(ms) | 无 |
| 整批真实墙钟耗时(ms) | 265300 |
| 缓存复跑耗时(ms) | 926 |
| 逻辑查询数 | 61 |
| 来源搜索尝试数 | 87 |
| HTTP 接口调用总数 | 87 |
| 重试/超时/最终错误/缓存命中 | 26/31/12/0 |
| 状态码统计 | error=7、timeout=31 |

- 逻辑查询数：61
- 来源搜索尝试数：87
- HTTP 接口调用总数：87
- 可直接使用候选：0
- 仅发现候选：0
- 许可提示：即使列为可直接使用候选，仍须逐图遵守许可条款、署名要求及第三方权利限制。

| 节点 | 来源 | 状态 | 行等待(ms) | 首次精准(ms) | 三张精准(ms) | 批次墙钟(ms) | 精准/待确认/拒绝 |
|---|---|---|---:|---:|---:|---:|---:|
| 金沙江大桥（竹巴笼） | pixabay | 已拒绝 | 69999 | 无 | 无 | 265300 | 0/0/53 |
| 金沙江大桥（竹巴笼） | commons | 来源未执行 | 31959 | 无 | 无 | 265300 | 0/0/0 |
| 金沙江大桥（竹巴笼） | openverse | 来源未执行 | 31960 | 无 | 无 | 265300 | 0/0/0 |
| 金沙江大桥（竹巴笼） | brave | 来源未执行 | 45 | 无 | 无 | 265300 | 0/0/0 |
| 金沙江大桥（竹巴笼） | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| G318/G248交叉口（营官村） | pixabay | 已拒绝 | 33221 | 无 | 无 | 265300 | 0/0/32 |
| G318/G248交叉口（营官村） | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| G318/G248交叉口（营官村） | openverse | 来源未执行 | 10642 | 无 | 无 | 265300 | 0/0/0 |
| G318/G248交叉口（营官村） | brave | 来源未执行 | 1 | 无 | 无 | 265300 | 0/0/0 |
| G318/G248交叉口（营官村） | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 尼玛贡神山大型观景台旅游服务区 | pixabay | 已拒绝 | 87878 | 无 | 无 | 265300 | 0/0/46 |
| 尼玛贡神山大型观景台旅游服务区 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 尼玛贡神山大型观景台旅游服务区 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 尼玛贡神山大型观景台旅游服务区 | brave | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 尼玛贡神山大型观景台旅游服务区 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 姊妹湖 | pixabay | 待人工确认 | 90378 | 无 | 无 | 265300 | 0/1/49 |
| 姊妹湖 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 姊妹湖 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 姊妹湖 | brave | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 姊妹湖 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 米堆冰川 | pixabay | 已拒绝 | 84850 | 无 | 无 | 265300 | 0/0/42 |
| 米堆冰川 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 米堆冰川 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 米堆冰川 | brave | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 米堆冰川 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 卓克基土司官寨 | pixabay | 已拒绝 | 67011 | 无 | 无 | 265300 | 0/0/51 |
| 卓克基土司官寨 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 卓克基土司官寨 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 卓克基土司官寨 | brave | 来源未执行 | 1 | 无 | 无 | 265300 | 0/0/0 |
| 卓克基土司官寨 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 喇荣五明佛学院 | pixabay | 已拒绝 | 53108 | 无 | 无 | 265300 | 0/0/56 |
| 喇荣五明佛学院 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 喇荣五明佛学院 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 喇荣五明佛学院 | brave | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 喇荣五明佛学院 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 德格印经院 | pixabay | 已拒绝 | 97216 | 无 | 无 | 265300 | 0/0/39 |
| 德格印经院 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 德格印经院 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 德格印经院 | brave | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 德格印经院 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 雀儿山隧道 | pixabay | 已拒绝 | 37699 | 无 | 无 | 265300 | 0/0/43 |
| 雀儿山隧道 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 雀儿山隧道 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 雀儿山隧道 | brave | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 雀儿山隧道 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 孜珠寺 | pixabay | 已拒绝 | 78681 | 无 | 无 | 265300 | 0/0/36 |
| 孜珠寺 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 孜珠寺 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 孜珠寺 | brave | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 孜珠寺 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 格聂之眼 | pixabay | 来源未执行 | 99840 | 无 | 无 | 265300 | 0/0/20 |
| 格聂之眼 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 格聂之眼 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 格聂之眼 | brave | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 格聂之眼 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 格聂神山 | pixabay | 来源未执行 | 45945 | 无 | 无 | 265300 | 0/0/0 |
| 格聂神山 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 格聂神山 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 格聂神山 | brave | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 格聂神山 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 冷古寺 | pixabay | 来源未执行 | 26375 | 无 | 无 | 265300 | 0/0/20 |
| 冷古寺 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 冷古寺 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 冷古寺 | brave | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 冷古寺 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 下则通村 | pixabay | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 下则通村 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 下则通村 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 下则通村 | brave | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 下则通村 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 热梯河谷 | pixabay | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 热梯河谷 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 热梯河谷 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 热梯河谷 | brave | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 热梯河谷 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 成都博物馆 | pixabay | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 成都博物馆 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 成都博物馆 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 成都博物馆 | brave | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 成都博物馆 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 成都武侯祠博物馆 | pixabay | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 成都武侯祠博物馆 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 成都武侯祠博物馆 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 成都武侯祠博物馆 | brave | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 成都武侯祠博物馆 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 成都杜甫草堂博物馆 | pixabay | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 成都杜甫草堂博物馆 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 成都杜甫草堂博物馆 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 成都杜甫草堂博物馆 | brave | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 成都杜甫草堂博物馆 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 东郊记忆 | pixabay | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 东郊记忆 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 东郊记忆 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 东郊记忆 | brave | 来源未执行 | 1 | 无 | 无 | 265300 | 0/0/0 |
| 东郊记忆 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 春熙路 | pixabay | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 春熙路 | commons | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 春熙路 | openverse | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 春熙路 | brave | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |
| 春熙路 | mapillary | 来源未执行 | 0 | 无 | 无 | 265300 | 0/0/0 |

## 金沙江大桥（竹巴笼）

- 地点状态：已拒绝
- pixabay：已拒绝
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/vietnam-nature-lua-rice-hoangsuphi-8047523/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/birds-cormorant-nature-ornithology-6816960/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/bali-tradition-indonesia-balinese-4319964/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
- commons：来源未执行
  - 错误：500 fetch failed
  - 错误：500 fetch failed
  - 错误：500 fetch failed
- openverse：来源未执行
  - 错误：500 fetch failed
  - 错误：500 fetch failed
  - 错误：500 fetch failed
- brave：来源未执行
- mapillary：来源未执行

## G318/G248交叉口（营官村）

- 地点状态：已拒绝
- pixabay：已拒绝
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/security-man-escalator-police-869216/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/kangding-snow-mountain-the-scenery-2652746/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/village-old-village-old-houses-7258991/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
- commons：来源未执行
- openverse：来源未执行
  - 错误：500 fetch failed
- brave：来源未执行
- mapillary：来源未执行

## 尼玛贡神山大型观景台旅游服务区

- 地点状态：已拒绝
- pixabay：已拒绝
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/statue-meditation-buddha-gaya-7329573/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/observation-deck-tokyo-skytree-7103210/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/pagoda-buddha-purnima-temple-buddha-4839805/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 姊妹湖

- 地点状态：待人工确认
- pixabay：待人工确认
  - 待人工确认 · **无标题**
    - 身份原因：insufficient-independent-evidence
    - 身份证据：name
    - 来源页：[来源页](https://pixabay.com/zh/photos/sichuan-batang-sister-lake-sichuan-2470007/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/vietnam-nature-lua-rice-hoangsuphi-8047523/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/gannet-sea-bird-yellow-coast-1611079/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 错误：timeout Request timed out after 15000ms
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 米堆冰川

- 地点状态：已拒绝
- pixabay：已拒绝
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/stones-waterfalls-balance-5677828/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/icebergs-glacier-nature-8430043/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/rocks-cairn-balance-rock-balancing-15712/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 卓克基土司官寨

- 地点状态：已拒绝
- pixabay：已拒绝
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/animal-corgi-pet-canine-mammal-6902459/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/island-visovac-krka-national-park-4028988/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/animal-dog-corgi-breed-canine-pet-6889575/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 喇荣五明佛学院

- 地点状态：已拒绝
- pixabay：已拒绝
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/china-tibetan-color-natural-9416752/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/monk-houses-tibet-buddhist-college-6834802/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/vietnam-nature-lua-rice-hoangsuphi-8047523/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 德格印经院

- 地点状态：已拒绝
- pixabay：已拒绝
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/lighthouse-beach-sand-sea-coast-5702233/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/lake-nature-travel-landscape-6476212/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/river-architecture-water-6858013/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 雀儿山隧道

- 地点状态：已拒绝
- pixabay：已拒绝
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/lake-nature-travel-landscape-6476212/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/lake-reflection-nature-mountain-8070741/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/mountains-peaks-lake-landscape-7544027/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 孜珠寺

- 地点状态：已拒绝
- pixabay：已拒绝
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/cumin-black-cumin-herbs-ayurveda-5377180/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/old-man-temple-tibetan-area-7701426/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/bridal-beads-veil-white-pearls-1867900/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 错误：timeout Request timed out after 15000ms
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 格聂之眼

- 地点状态：来源未执行
- pixabay：来源未执行
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/litang-dawn-tibet-road-litang-4933007/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/gannet-sea-bird-yellow-coast-1611079/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/gannet-birds-animal-feathers-flock-9003524/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 错误：timeout Request timed out after 15000ms
  - 错误：timeout Request timed out after 15000ms
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 格聂神山

- 地点状态：来源未执行
- pixabay：来源未执行
  - 错误：timeout Request timed out after 15000ms
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 冷古寺

- 地点状态：来源未执行
- pixabay：来源未执行
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/litang-dawn-tibet-road-litang-4933007/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/gannet-sea-bird-yellow-coast-1611079/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
  - 已拒绝 · **无标题**
    - 身份原因：insufficient-identity-evidence
    - 身份证据：无
    - 来源页：[来源页](https://pixabay.com/zh/photos/gannet-birds-animal-feathers-flock-9003524/)
    - 作者：未知
    - 许可：[Pixabay Content License](https://pixabay.com/service/terms/)
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 下则通村

- 地点状态：来源未执行
- pixabay：来源未执行
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 热梯河谷

- 地点状态：来源未执行
- pixabay：来源未执行
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 成都博物馆

- 地点状态：来源未执行
- pixabay：来源未执行
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 成都武侯祠博物馆

- 地点状态：来源未执行
- pixabay：来源未执行
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 成都杜甫草堂博物馆

- 地点状态：来源未执行
- pixabay：来源未执行
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 东郊记忆

- 地点状态：来源未执行
- pixabay：来源未执行
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 春熙路

- 地点状态：来源未执行
- pixabay：来源未执行
- commons：来源未执行
- openverse：来源未执行
- brave：来源未执行
- mapillary：来源未执行

## 复核清单

### 无结果清单

- 金沙江大桥（竹巴笼） · pixabay：已拒绝
- G318/G248交叉口（营官村） · pixabay：已拒绝
- 尼玛贡神山大型观景台旅游服务区 · pixabay：已拒绝
- 米堆冰川 · pixabay：已拒绝
- 卓克基土司官寨 · pixabay：已拒绝
- 喇荣五明佛学院 · pixabay：已拒绝
- 德格印经院 · pixabay：已拒绝
- 雀儿山隧道 · pixabay：已拒绝
- 孜珠寺 · pixabay：已拒绝

### 待人工确认清单

- 姊妹湖 · pixabay：待人工确认

### 来源未执行清单

- 金沙江大桥（竹巴笼） · commons：circuit-open
- 金沙江大桥（竹巴笼） · openverse：circuit-open
- 金沙江大桥（竹巴笼） · brave：missing-credentials
- 金沙江大桥（竹巴笼） · mapillary：missing-credentials
- G318/G248交叉口（营官村） · commons：circuit-open
- G318/G248交叉口（营官村） · openverse：circuit-open
- G318/G248交叉口（营官村） · brave：missing-credentials
- G318/G248交叉口（营官村） · mapillary：missing-credentials
- 尼玛贡神山大型观景台旅游服务区 · commons：circuit-open
- 尼玛贡神山大型观景台旅游服务区 · openverse：circuit-open
- 尼玛贡神山大型观景台旅游服务区 · brave：missing-credentials
- 尼玛贡神山大型观景台旅游服务区 · mapillary：missing-credentials
- 姊妹湖 · commons：circuit-open
- 姊妹湖 · openverse：circuit-open
- 姊妹湖 · brave：missing-credentials
- 姊妹湖 · mapillary：missing-credentials
- 米堆冰川 · commons：circuit-open
- 米堆冰川 · openverse：circuit-open
- 米堆冰川 · brave：missing-credentials
- 米堆冰川 · mapillary：missing-credentials
- 卓克基土司官寨 · commons：circuit-open
- 卓克基土司官寨 · openverse：circuit-open
- 卓克基土司官寨 · brave：missing-credentials
- 卓克基土司官寨 · mapillary：missing-credentials
- 喇荣五明佛学院 · commons：circuit-open
- 喇荣五明佛学院 · openverse：circuit-open
- 喇荣五明佛学院 · brave：missing-credentials
- 喇荣五明佛学院 · mapillary：missing-credentials
- 德格印经院 · commons：circuit-open
- 德格印经院 · openverse：circuit-open
- 德格印经院 · brave：missing-credentials
- 德格印经院 · mapillary：missing-credentials
- 雀儿山隧道 · commons：circuit-open
- 雀儿山隧道 · openverse：circuit-open
- 雀儿山隧道 · brave：missing-credentials
- 雀儿山隧道 · mapillary：missing-credentials
- 孜珠寺 · commons：circuit-open
- 孜珠寺 · openverse：circuit-open
- 孜珠寺 · brave：missing-credentials
- 孜珠寺 · mapillary：missing-credentials
- 格聂之眼 · pixabay：circuit-open
- 格聂之眼 · commons：circuit-open
- 格聂之眼 · openverse：circuit-open
- 格聂之眼 · brave：missing-credentials
- 格聂之眼 · mapillary：missing-credentials
- 格聂神山 · pixabay：circuit-open
- 格聂神山 · commons：circuit-open
- 格聂神山 · openverse：circuit-open
- 格聂神山 · brave：missing-credentials
- 格聂神山 · mapillary：missing-credentials
- 冷古寺 · pixabay：circuit-open
- 冷古寺 · commons：circuit-open
- 冷古寺 · openverse：circuit-open
- 冷古寺 · brave：missing-credentials
- 冷古寺 · mapillary：missing-credentials
- 下则通村 · pixabay：circuit-open
- 下则通村 · commons：circuit-open
- 下则通村 · openverse：circuit-open
- 下则通村 · brave：missing-credentials
- 下则通村 · mapillary：missing-credentials
- 热梯河谷 · pixabay：circuit-open
- 热梯河谷 · commons：circuit-open
- 热梯河谷 · openverse：circuit-open
- 热梯河谷 · brave：missing-credentials
- 热梯河谷 · mapillary：missing-credentials
- 成都博物馆 · pixabay：circuit-open
- 成都博物馆 · commons：circuit-open
- 成都博物馆 · openverse：circuit-open
- 成都博物馆 · brave：missing-credentials
- 成都博物馆 · mapillary：missing-credentials
- 成都武侯祠博物馆 · pixabay：circuit-open
- 成都武侯祠博物馆 · commons：circuit-open
- 成都武侯祠博物馆 · openverse：circuit-open
- 成都武侯祠博物馆 · brave：missing-credentials
- 成都武侯祠博物馆 · mapillary：missing-credentials
- 成都杜甫草堂博物馆 · pixabay：circuit-open
- 成都杜甫草堂博物馆 · commons：circuit-open
- 成都杜甫草堂博物馆 · openverse：circuit-open
- 成都杜甫草堂博物馆 · brave：missing-credentials
- 成都杜甫草堂博物馆 · mapillary：missing-credentials
- 东郊记忆 · pixabay：circuit-open
- 东郊记忆 · commons：circuit-open
- 东郊记忆 · openverse：circuit-open
- 东郊记忆 · brave：missing-credentials
- 东郊记忆 · mapillary：missing-credentials
- 春熙路 · pixabay：circuit-open
- 春熙路 · commons：circuit-open
- 春熙路 · openverse：circuit-open
- 春熙路 · brave：missing-credentials
- 春熙路 · mapillary：missing-credentials

## 本轮结论与来源决策

### 结论

- **正式自动配图主源：暂不选择。** 本轮没有任何候选同时通过地点身份、许可与可用性门槛，不能把“搜到相似风景”误当成“搜到该地点”。
- **候选发现主源：Pixabay。** 它实际返回了 488 个候选，但 487 个因缺少地点身份证据被拒绝，1 个进入人工确认，0 个可自动使用。它可以继续承担“找线索”，不能单独承担“自动定图”。
- **待复测备用源：Wikimedia Commons、Openverse。** 两者在当前网络环境连续 `fetch failed` 后熔断，本轮没有形成有效质量结论；应先解决连通性，再用同一批 20 节点复测。
- **本轮不纳入候选：Brave、Mapillary。** 两者因未配置凭据而未执行，这只是本轮范围排除，不代表永久质量淘汰。Mapillary 更适合道路、路口和沿途实景；Brave 更适合发现权威景区页，均需在有凭据后单独验证。
- **明确淘汰的方案：单一图库 + 名称/标签模糊匹配后直接自动填图。** 金沙江大桥等唯一实体必须有完整地名、地区或坐标等身份硬证据；否则只能进入人工确认，不能进入视频。

### 关键证据

- 20 个地点、61 次逻辑查询、87 次上游请求；冷启动约 265 秒，缓存复跑约 0.9 秒。
- 精准候选 0，人工确认 1，拒绝 487；发布安全闸门通过，说明没有明显错图越过身份校验。
- Pixabay 在部分地点出现 15 秒超时并最终熔断；Commons、Openverse 因网络连接失败熔断。因此本轮性能数据可证明缓存有效，但不能证明公共源已经达到生产稳定性。
- 本轮没有搜到 London/Tower Bridge 候选；同时，金沙江大桥的 53 个泛化候选全部被拒绝，没有因“都是桥”而误判为精准图片。

### 下一步建议

正式搜图应采用“多源召回 → 地点实体核验 → 图片内容核验 → 许可核验 → 缓存”的分层流程。下一轮优先补通 Commons/Openverse，并增加可提供坐标或权威页面证据的来源；在精准率达到要求前，系统应宁可显示“未找到可信图片”，也不自动填入错图。
