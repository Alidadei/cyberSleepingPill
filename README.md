# 赛博睡眠社区 cyberSleep 🌙

**致失眠焦虑刷手机的你：这里是刷着刷着能让你睡着的地方。**——安卓光闹钟应用 [睡眠站台](https://github.com/Alidadei/MySleep) 的姊妹项目。

在这里你可以：

- 🔗 **推荐**助眠内容（白噪音、有声书、助眠视频……B 站直达链接为主，国内免翻墙）
- ⭐ 给内容打分（1–5，按"助眠效果"），好内容自然浮上来
- 🏷️ 按**失眠类型**找对症内容：焦虑型 / 兴奋型 / 生理型 / 噪音干扰型
- 🚫 广告卖货内容会被自动拦下（与 APP 同一套 AdGuard 规则，词表开源）

不装 APP 也能用；装了 APP 也一样用。两端共享同一份[数据契约](docs/DATA_CONTRACT.md)。

## 使用

纯静态单文件网站，零依赖、无账号、无追踪：

- **在线（主）**：GitHub Pages（Settings → Pages 开启 main 分支即可，`https://alidadei.github.io/cyberSleepCommunity/`）
- **在线（备）**：CloudBase 静态托管（暂缓，国内快、可绑域名，见 [docs/deploy-guide.md](docs/deploy-guide.md)）
- **本地**：直接双击 `index.html` 就能用，数据存在浏览器里
- **搬家**：底部「导出数据 JSON / 导入数据 JSON」

## 给开发者 / AI agent

- [docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md) —— 与 APP 端对齐的数据契约（字段、类型、排序、红线）
- [docs/ROADMAP.md](docs/ROADMAP.md) —— **统一进度清单**（上线/数据后端/域名/功能的 todo 总中心）
- [docs/AGENT_HANDOFF.md](docs/AGENT_HANDOFF.md) —— 接手开发指南（当前状态、铁律、路线）
- [docs/supabase-quickstart.md](docs/supabase-quickstart.md) —— 当前数据后端（Supabase 试用）开通与延迟初测
- [docs/cloudbase-migration.md](docs/cloudbase-migration.md) —— 备选：境内延迟不可接受时切腾讯云 CloudBase(PG 模式)
- [docs/deploy-guide.md](docs/deploy-guide.md) —— 域名方案：GitHub Pages 主 + CloudBase 备（双域 canonical/og 支持）
- [docs/adguard-rules.json](docs/adguard-rules.json) —— 反广告词表唯一权威来源
- [docs/supabase-schema.sql](docs/supabase-schema.sql) —— 云端建表脚本（SQL Editor 直接粘贴执行）
- [tests/dom-test.mjs](tests/dom-test.mjs) —— 零依赖行为测试，`node tests/dom-test.mjs` 一键回归
- [tests/store-backend-test.mjs](tests/store-backend-test.mjs) —— 双后端（Supabase/CloudBase）链路测试

## 路线

| 阶段 | 状态 | 说明 |
|---|---|---|
| P0 本机版 | ✅ | localStorage 存储，导出/导入 JSON 搬家（导入自动合并去重） |
| P2 体验增强 | ✅ 当前 | 星星打分控件、匿名昵称「未寝人####」、URL 去重提示、「APP 同款」标识 |
| P1 云端互通 | 试用中 | 数据后端 = Supabase 免费档（填两行配置即通）；域名 = GitHub Pages 主 + CloudBase 备（详见 [docs/ROADMAP.md](docs/ROADMAP.md)） |
| P3 社区深化 | 远期 | 与 APP「寻找张怀民」联动留言墙、睡眠画像互通 + AI 分析推荐 |

## 许可

与 APP 同源理念，代码开源。数据版权归分享者所有。
