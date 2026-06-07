# 318路书

> 在地图上规划自驾路线，自动生成带旁白讲解的飞行动画视频。

318路书是一个面向自驾旅行者的路书规划与讲解视频生成工具。在地图上自由规划多日自驾路线、搜索沿途餐饮住宿景点，完成后一键生成「飞行动画 + AI 旁白讲解」的路书视频。

## ✨ 功能

- 🗺️ 基于高德地图的路线规划，沿真实道路计算驾车路线
- 🔍 POI 搜索：餐饮 / 住宿 / 景点 / 加油站 / 观景台
- 📝 旁白编辑 + AI 辅助生成草稿
- 🎬 飞行动画预览，旁白与画面自动同步
- 📹 一键导出讲解视频
- 🚗 内置 318 川藏线 9 天预设路线

## 🚀 快速开始

```bash
git clone https://github.com/jkvhb/318.git
cd 318
npm install
npm run dev
```

打开 http://localhost:5173 ，在「设置」页填入你的高德地图 API Key 即可使用。

## 🔑 获取高德 API Key

1. 访问 [高德开放平台](https://lbs.amap.com/) 注册账号
2. 创建应用，添加 Key，服务平台选「Web 端 (JS API)」
3. 把 Key 填入应用「设置」页

> ⚠️ API Key 仅保存在你的浏览器本地（localStorage），不会上传到任何服务器。

## 🛠️ 技术栈

Vue 3 · Vite · Pinia · Vue Router · TailwindCSS · 高德地图 JS API · MapLibre GL JS

## 📄 许可证

[MIT](./LICENSE) © jkvhb
