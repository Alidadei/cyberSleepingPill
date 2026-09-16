# 数据契约 DATA_CONTRACT v1.1

> 本文件是「睡眠站台」安卓 APP 与 cyberSleepCommunity 网站的**共同宪法**。
> 任何一端修改本契约，必须同步修改另一端并在此记录版本号。
> APP 端实现：`fossify-clock/app/src/main/kotlin/org/fossify/clock/helpers/`（RelaxStore.kt / InsomniaTypes.kt / AdGuard.kt）
> 网站端实现：`index.html` 内 `Store` / `AdGuardJS` 模块

## 1. CommunityPick（社区推荐条目）

```json
{
  "id": 1725000000000,          // number，epoch 毫秒（与 APP 的 Long id 一致；P1 上后端换 UUID 时两端同时改）
  "title": "雨声助眠 8 小时",    // string，非空
  "url": "https://...",         // string，http/https，可带 query 参数
  "type": "anxiety",            // string|null，见 §2
  "ratings": [4, 5, 3],         // int 数组，每项 1–5，来自所有打分用户
  "addedAt": 1725000000000,     // number，epoch 毫秒
  "recommendCount": 3           // number，≥1（同一 URL 被提交的次数；重复提交 recommendCount+1，保留首条标题/类型；≥2 时卡片展示「被推荐 N 次」）
}
```

APP 端 Gson 反序列化：缺失字段取默认值（ratings=null 视作空、type=null 视作未分类、addedAt=0、recommendCount=1）。
网站端 localStorage / Supabase 序列化必须使用**完全相同的字段名**，禁止改名/改型。
提交合并语义（v1.2）：同一 URL 重复提交 → recommendCount+1（保留首条 title/type），不再作为错误拦截（仅内置精选不可合并）；卡片推荐次数 ≥2 时展示「被推荐 N 次」，不影响排序。

## 2. 失眠类型标签（type）

| key | 中文 | 说明 |
|---|---|---|
| `anxiety` | 焦虑型 | 思绪停不下来 |
| `excitement` | 兴奋型 | 大脑过电影 |
| `physical` | 生理型 | 腰酸背痛肠胃不适 |
| `noise` | 噪音干扰型 | 环境噪音 |
| `null` | 未分类 | 提交时可不确定 |

`"all"` 仅是 APP UI 的筛选值，**不得存入数据**。

> **v1.1（2026-09-10）**：type 取值域扩展——除内置四类 key 外，允许**自定义标签**：
> ≤12 字符的任意字符串（去首尾空白），例如「白噪音」「ASMR」。结构不变（仍是 string）。
> 展示规则：两端遇到未知 type 时**原样显示该字符串**（APP 端 RelaxFragment 需在下一次
> 更新时兼容：未知 key 不再丢弃/报错，直接展示原文）。网站端已实现（`# 标签` 样式）。

## 3. 排序与聚合（两端必须一致）

```text
平均分降序 → 评分数降序 → addedAt 降序
平均分 = ratings 数组算术平均，保留浮点（展示时格式化一位小数）
```

APP 端见 `RelaxFragment.populateSection()` 的 `compareByDescending` 链；
网站端见 `index.html` 的 `sortPicks()`。

## 4. 反广告规则（AdGuard v1，两端词表同步）

提交（标题+URL 拼接检查）按以下顺序判定，**命中即拒绝发布**：

1. 联系方式/短链正则：微信号模式、QQ群号、11 位手机号、t.cn/bit.ly 等短链
2. 强关键词（词表见 `docs/adguard-rules.json`）：命中 1 个即拒
3. 弱关键词：命中 ≥2 个即拒

词表唯一权威来源：**`docs/adguard-rules.json`**。
APP 端 Kotlin 词表（AdGuard.kt）与网站端 JS 词表均从此文件生成，改动时三处同步。

## 5. P0 存储形态（当前，0 预算）

| 端 | 存储 | 说明 |
|---|---|---|
| APP | SharedPreferences `relax_favorites` → `community_picks_json`（Gson 数组） | 仅本机 |
| 网站 | localStorage key `csc_community_picks`（JSON 数组） | 仅浏览器本机 |

P0 两端**不直接互通**（无后端）。原网站提供「导出 JSON / 导入 JSON」按钮，与 APP 的数据文件可人工搬运对齐（字段一致，可直接互导）。
**2026-09-17**：该入口按站主决定从网站导航下线（社区数据以云端为唯一通道）；文件格式本身保留——APP 侧三页导入导出不变，网站收藏页的收藏导出/导入仍与 APP 收藏文件互通（RelaxItem 形状，见 AGENT_HANDOFF）。

## 6. P1 数据互通（目标态，Supabase 免费档）

注册 Supabase（0 元）建一个项目后：

- 表 `community_picks`，列与 §1 字段一一对应（id bigint 主键，ratings 用 int[] 或子表）
- 开启 anon 角色的 select/insert 权限（打分=select 后 update ratings 数组，或拆 `ratings` 子表 + RLS）
- **APP 端**：`RelaxStore.getCommunityPicks/addCommunityPick/rateCommunityPick` 是预留的换源点（注释已标明），新增 `RemoteStore` 实现，用 `POST {SUPABASE_URL}/rest/v1/community_picks` 即可，无需第三方 SDK
- **网站端**：`index.html` 的 `Store` 对象换 `SupabaseStore` 实现（fetch 同一 REST 地址）
- 两端 URL/ANON_KEY 放在各自的配置点：APP=`BuildConfig` 字段或远程 JSON，网站=`config.js`

P1 完成后 P0 的 localStorage 数据用「导入 JSON」按钮一次性迁移。

> 实现进度（2026-09-09）：网站端 `SupabaseStore` 已写入 `index.html`（原生 fetch，同
> LocalStore 的 load/save/add/rate 异步接口），建表脚本见 `docs/supabase-schema.sql`；
> 在 `index.html` 顶部 `SUPABASE = { url, anonKey }` 填入两值即启用，留空维持本机存储。
> APP 端 `RemoteStore.kt` 尚未动工，换源点见 §6 上文。

## 7. 兼容性红线

- APP 是 GPL-3.0 开源，网站内容若与 APP 联动，网站代码也建议开源（同仓库）
- 两端展示名称统一：「睡眠站台」APP / 「赛博睡眠社区 cyberSleep」网站
- `title` 长度上限 80 字符（APP LinkParser 截断值），超长端截断
- URL 必须 `http(s)://` 开头（APP 端 `normalizeUrl` 会自动补 https）
