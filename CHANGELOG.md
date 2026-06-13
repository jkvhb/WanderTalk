# Changelog

本项目所有重要变更记录于此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.2.0] - 2026-06-13

第二阶段：路线编辑与地图交互。

### Added
- GCJ-02 ↔ WGS-84 坐标转换层，数据模型统一存储 WGS-84
- 高德驾车路线计算：沿真实道路绘制、距离/时长展示、IndexedDB 缓存
- 多天路线分段编辑：增删天数、节点重命名/删除、住宿地编辑
- 节点拖拽排序：三横线手柄长按拖动（vuedraggable）
- POI 搜索结果一键添加到指定天
- 地图点击就近搜索 POI，浮窗内选天 + 按位置插入（确定/取消预览）
- 路书 IndexedDB 自动保存与启动恢复
- 路书 JSON 导出/导入

### Fixed
- POI 搜索/路径规划失败时错误信息可读化（修复显示「[object Event]」，并提示安全密钥/网络等可操作方向）

## [0.1.0] - 2026-06-07

第一阶段：项目骨架与地图基础。

### Added
- 项目初始化：Vue 3 + Vite + TailwindCSS 脚手架
- 三视图导航：路线规划 / 视频工作室 / 设置
- 设置页：高德 API Key 本地持久化
- 318 川藏线 9 天预设数据
- 高德地图显示与 POI 搜索
