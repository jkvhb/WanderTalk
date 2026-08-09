# 浏览器本地 Kimi Key 设置设计

## 目标

在“设置”页提供 Kimi API Key 输入位置，让个人本机使用者无需编辑 `.env` 即可使用 Kimi 生成文案、搜图查询词和动效编排。

## 用户体验

- 默认 AI 模型选择 Kimi 时，显示“Kimi API Key”密码输入框和“清除”按钮。
- 保存后只存入当前浏览器的 `localStorage`，刷新页面后仍可使用。
- 未填写浏览器 Key 时，继续兼容本地服务端的 `MOONSHOT_API_KEY`。
- 浏览器与服务端都未配置时，统一提示“请在设置中填写 Kimi API Key”。
- DeepSeek 的现有输入方式和备用模型逻辑保持不变。

## 数据流

1. 设置页把 Kimi Key 写入独立键 `318:kimiKey`，不与 DeepSeek Key 混用。
2. 前端调用 `/api/narration`、`/api/imageQuery`、`/api/choreography` 时，根据当前模型发送对应 Key。
3. 服务端调用 Kimi 时优先使用请求携带的浏览器 Key；请求未携带时，备用读取 `MOONSHOT_API_KEY`。
4. Key 只用于向 Moonshot 官方接口发送 `Authorization` 请求头，不进入返回值、日志、行程、图片数据或导出文件。

通俗来说：浏览器记住 Key，每次需要 AI 时临时交给本机服务；本机服务只负责转发给 Kimi，不把 Key 混进项目内容。

## 安全边界

- 输入框使用密码类型，页面不直接显示完整 Key。
- 不把 Key 写入源代码、`.env.example`、Git、错误提示或测试快照。
- 提供清除操作，立即删除浏览器中的 `318:kimiKey`。
- `localStorage` 适合本机个人项目的便利场景，但无法抵御恶意浏览器扩展或同源脚本漏洞；界面会明确提示这一点。
- 已在聊天、截图或其他公开位置出现过的 Key 应作废重建，不能继续视为安全凭据。

## 兼容与错误处理

- 旧用户没有 `318:kimiKey` 时行为不变：仍可使用服务端环境变量。
- Kimi 与 DeepSeek 分别检查自己的 Key，不再出现选择 Kimi 却检查 DeepSeek Key 的情况。
- 服务端保留最后一道缺 Key 校验，避免前端绕过时发出无凭据请求。

## 测试

- 设置 store：Kimi Key 默认值、保存、刷新读回、清除，与 DeepSeek Key 相互独立。
- 前端请求：选择 Kimi 时携带 Kimi Key，选择 DeepSeek 时只携带 DeepSeek Key。
- 服务端：Kimi 浏览器 Key 优先于环境变量；缺少浏览器 Key 时使用环境变量；两者都缺失时不联网并返回可读错误。
- 全量测试与生产构建通过。

## 不在本次范围

- 不提供云端账号同步或跨浏览器同步。
- 不对 Key 做自建加密存储；没有安全密钥托管时，前端“加密”只会制造虚假安全感。
- 不把 Kimi Key 自动写入 `.env`。
