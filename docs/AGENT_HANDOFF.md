# AGENT_HANDOFF · cyberSleepCommunity 接手开发指南

> 写给下一个接手本项目的 ZCode agent。读完这一篇即可开工，不需要问用户任何背景问题。

## 0. 一句话定位

「赛博睡眠社区 cyberSleep」是安卓 APP **「睡眠站台」**（`R:\Code\MY project\guangnaozhong\fossify-clock`，GitHub: Alidadei/MySleep，GPL-3.0）的姊妹网站：一个**专门收藏让人犯困内容**的平台。用户可以不装 APP，直接在网站上推荐犯困内容、打分；装了 APP 也能做同样的事。**两边共享同一套数据契约**（`docs/DATA_CONTRACT.md`）。

用户身份：中国大陆个人开发者，**当前预算为 0**，产品哲学：无广告、无算法推荐、真实分享者社区。交流用简体中文。

## 1. 当前状态（P2 已完成，P1 代码就绪待账号）

```
cyberSleepCommunity/
├── index.html                  # 完整可用的单文件站（零依赖，直接浏览器打开即可用）
├── tests/
│   └── dom-test.mjs            # 零依赖行为测试（node tests/dom-test.mjs，37 项断言）
├── docs/
│   ├── DATA_CONTRACT.md        # ★ 两端共同的数据契约（字段/类型/排序/红线）
│   ├── supabase-schema.sql     # ★ P1 建表脚本（Supabase SQL Editor 直接粘贴执行）
│   ├── adguard-rules.json      # ★ 反广告词表唯一权威来源（三处同步）
│   └── AGENT_HANDOFF.md        # 本文件
└── README.md
```

- P2 体验增强已全部上线：星星打分控件（替代 prompt）、匿名昵称「未寝人####」、URL 去重提示、「APP 同款」标识
- 存储仍是 localStorage（key: `csc_community_picks`）；`index.html` 顶部 `SUPABASE = { url, anonKey }` 两值填齐即切到云端（`SupabaseStore` 已实现，同异步接口 load/save/add/rate）
- 内置精选 4 条 = APP `assets/relax_picks.json` 的同款 B 站直达链接，改任何一边要同步另一边
- 「导出/导入 JSON」仍是数据搬运通道；导入已改为按 id/URL 合并去重（不再整包覆盖）

## 2. 铁律（改代码前必读）

1. **改任何数据结构，先改 `docs/DATA_CONTRACT.md` 并升版本号**，然后三处同步：网站 `index.html` 的 `Store`/`AdGuard`、APP 端 `RelaxStore.kt`/`AdGuard.kt`、`adguard-rules.json` 词表。
2. **网站保持零依赖单文件**（index.html 内联 CSS/JS）。不要引入 React/Vue/npm 构建链——用户明确偏好零依赖、可直接部署 GitHub Pages 的形态。P1 需要 Supabase 时用原生 `fetch` 调 REST，不要装 SDK。
3. **绝不引入广告、追踪器、Cookie 横幅**。产品定位是"真实分享者社区"。
4. APP 端 `CommunityPick.id` 是 `Long`（时间戳）——网站必须用 `number`；改 UUID 需两端同时动（契约 §1）。
5. 排序规则（平均分→评分数→addedAt）两端必须一致，APP 端在 `RelaxFragment.populateSection()`。
6. 中文 UI；用户手机是浅色模式，但网站当前是深色星光系（与 APP 品牌一致），如果做浅色主题需问用户。
7. 改完 `index.html` 必须跑 `node tests/dom-test.mjs`（零依赖，纯 Node，无 npm install），断言全绿才算完；改了行为就同步补断言。
   **教训（2026-09-10）**：曾删掉 `<div id="chips">` 导致浏览器里样例/榜单全空，但测试桩按 id 注册表跑、60 项断言照样全绿——桩看不出 HTML 结构损伤。现已加「关键 id 恰好出现一次」的结构冒烟检查；**动过 HTML 结构后，务必在真实浏览器里数一遍 `.card` 数量**再交付。

## 3. 下一步路线（按优先级）

### P1：两端数据实时互通（核心目标，0 预算可行；网站端代码已就绪）

1. ~~注册 Supabase 免费项目~~ ← **只剩这一步需要站主动手**（supabase.com，0 元，500MB 库 / 5 万 MAU）
2. 建表 `community_picks`：打开 Supabase SQL Editor，粘贴执行 `docs/supabase-schema.sql` 即可（列 = 契约 §1 字段，RLS 已配好 anon select/insert/update）
3. 网站端：**已完成**。`index.html` 的 `SupabaseStore` 用原生 `fetch` 调 REST（无 SDK），与 `LocalStore` 同异步接口（load/save/add/rate）；把 Project URL + anon key 填进 `index.html` 顶部 `SUPABASE = { url, anonKey }` 两值即启用，留空自动维持本机模式。anon key 本来就是公开凭据，权限靠 RLS 管
4. APP 端：`RelaxStore.kt` 的 `getCommunityPicks/addCommunityPick/rateCommunityPick` 是预留换源点（文件头注释已写明"backend lands → swap point"），加 `RemoteStore.kt` 用 `HttpURLConnection` 调同一 REST 地址；建议加个设置开关"社区云同步"
5. P1 上线后通知用户：本机 localStorage 数据用「导入数据 JSON」一次性迁移（导入会按 id/URL 合并去重，不会覆盖云端已有条目）

### P2：体验增强（✅ 已完成，2026-09-09）

- ~~匿名昵称~~：localStorage 生成「未寝人####」，显示在页头问候语（与 APP 的 `NightTalk.SleepProfile` 同款逻辑）
- ~~按 URL 去重提示~~：发布时若链接已存在（社区或内置精选，协议/www/尾斜杠归一后比对），行内提示「这条已经在社区里了（原标题），直接去给它打个分吧」
- ~~打分改为星星控件~~：每张社区卡右上「评分 ☆」展开五颗内联 SVG 星，hover/focus 逐颗预览、点击即提交、行内 ✓ 反馈 1.5s 后刷新排序；ESC 或再点一次收起
- ~~APP ↔ 网站"同款内容"标识~~：社区条目 URL 与内置精选一致时显示「APP 同款」徽章（内联 SVG 链条图标 + 文案，不用 🤝，原因见 §6）

### P3（远期，需用户决策）
- 睡眠画像互通（契约新增 user 段）
- 与 APP「寻找张怀民」联动：网站留言墙（APP 端 P1 留言墙上线后）

## 4. 部署

- GitHub Pages：仓库 Settings → Pages → Deploy from branch `main` / root（若尚未开启）。站点即 `https://alidadei.github.io/cyberSleepCommunity/`（仓库名大小写敏感）
- 纯静态，无构建步骤，push 即部署（Pages 构建约 1 分钟）
- 自定义域名/CDN：用户暂不需要，别主动加

## 5. APP 端速查（跨项目协作时）

- 代码：`R:\Code\MY project\guangnaozhong\fossify-clock`（独立 git 仓库，GitHub: Alidadei/MySleep）
- 构建命令、便携工具链位置、版本号位置：见该仓库 `FORK_NOTES.md` 的「构建」章节
- 助眠相关文件：`helpers/RelaxStore.kt`（收藏+社区数据）、`helpers/PicksRepository.kt`（精选源）、`helpers/AdGuard.kt`、`helpers/InsomniaTypes.kt`、`helpers/LinkParser.kt`、`fragments/RelaxFragment.kt`（全部 UI）
- APP 有 Robolectric 测试（`./gradlew :app:testFossDebugUnitTest`），动 RelaxStore 前先跑通再动

## 6. 已知取舍（不要"修复"它们）

- ~~`prompt()` 打分框很朴素~~——P2 已换成星星控件；打分后 ✓ 停留 1.5s 才刷新列表，让排序自然归位，是有意不做成"打完分瞬间跳动"
- 「APP 同款」徽章没用交接原案的 🤝，而是内联 SVG 链条图标 + 文案——审美规范 §12.8 第 4 条规定全站 emoji 仅品牌位一颗（🌙），功能图标一律内联 SVG
- 导入 JSON 从 P0 的"整包覆盖"改成了"按 id/URL 合并去重"——防止用户导入时误删本机数据；统计文案会写明跳过多少条
- 内置精选的 `sampleRatingAvg/sampleRatingCount` 仍是演示值——真实用户评分接入 Supabase 后用聚合值替换；样例与真实内容**同榜按分排序**（avgOf/countOf 兼容两种字段），页面空态也注明「仅为演示数据」
- 卡片「整卡可点」用拉伸链接实现（标题锚点 `::after` 覆盖卡片），评分按钮/星星行靠 `position:relative` 保持可点；改卡片层级时别破坏这个模式
- 评分展开行同时只开一个、社区卡无评分时 meta 显示来源域名（非完整 URL）——都是按审美规范 §12.5 做的
- P1 anon update 不限列，并发打分会互相覆盖 ratings——小社区可接受（schema 文件里也写了），P3 可拆 ratings 子表
- **配色已换 + 昼夜渐变（2026-09-10 站主定）**：站主先后给了两张配色参考图——夜=「藕荷紫 #B89BBF × 月砂灰 #DDD2CB」，昼=「琥珀棕 #8E705F × 雾杏粉 #E9D2C7」。现行机制：`index.html` `<head>` 内时辰主题脚本按本地时间在两套色板间**连续插值**（5–8 点渐亮、17–20 点渐暗，页面久开每 10 分钟缓移），全部色值从 `:root` 令牌走，`--t`（0=夜 1=昼）驱动 header 天幕星空/阳光书桌两层交叉淡化。审美规范 §12.3 旧色板与「恒夜色」条款就此作废，**不要按旧文档改回去**；调试可加 `?day=1` / `?day=0` 强制时辰。对比度红线不变：昼间正文/辅助/强调色均已核 ≥4.5:1（大字 ≥3:1）
- **header 天幕**：`.sky` 纯 CSS 场景（夜=星空+月晕，昼=暖光+斜射光带+叶影，零图片）；改 header 结构时别破坏 `header>*:not(.sky)` 的层级与 `.sky` 的 `pointer-events:none`
- **链接解析与问候对齐 APP（2026-09-10）**：`parseShareText` 与 APP `LinkParser.parse` 同款（四种书名号 【】「」『』《》 + URL 尾部标点修剪）；只贴链接不填标题时 `fetchTitleAsync` 自动抓标题——B 站走开放 API 的 **JSONP**（API 无 CORS 头，fetch 会被拦，别改回 fetch），其余站点直连读 `<title>`（多数会被 CORS 拦，静默回退域名标题，是有意的诚实降级）；`b23.tv` 短链解析不了标题（APP 原生跳转可以），但 B 站分享文本自带【】标题所以影响有限。清洗规则 `cleanTitle` 与 APP 同款（站点后缀表 + 80 字截断）。隐私红线：标题抓取只访问链接所属平台本身，**永远不要引第三方 CORS 代理**
- 问候语跟昼夜主题：昼=`天亮了，沐浴下阳光吧`（不带昵称），夜=`夜深了`/`早上好`/`晚上好` + `，未寝人####`；由 `window.__dayT` 驱动，页面久开随 10 分钟 tick 一起刷新
- **文字导航栏 + 发布面板（2026-09-10 站主要求）**：页面首行是文字导航 `.nav`（推荐/导出/导入，右对齐，非固定），品牌模块在其下；「推荐」点开 `.panel` 下拉面板（max-height+opacity 0.3s 过渡，ESC/点外部/再点一次关闭）；导入结果用 `.toast`（ioMsg）提示、4s 自动消退。`.form` 默认藏在面板里——测试直接调 `fSubmit.onclick` 不受影响
- **样例打分模拟（2026-09-10 站主要求）**：样例卡也有星星评分入口；用户评分存独立本地键 `csc_sample_ratings`（按 urlKey 归档，上限 50 条），展示时并入示例聚合值 `(均分×次数+新评分)/次数+1`，排序随之实时变化；**不写入契约数据 csc_community_picks**，Supabase 接入后样例整体被真实数据替换时该键直接弃用
- 品牌图标为内联 SVG 昼夜双形（`.bicon`：夜月昼日，靠 `--t` 交叉淡化），页面已无任何 emoji（🌙 也移除了，规范 12.8 第 4 条超额达成）；副标题站主定稿：「一个专门收录让人犯困内容的打分网站 · 数据联通「睡眠站台」APP」
- **全屏入场 + 全宽天空 hero（2026-09-10 站主要求）**：首次会话播放全屏入场动画——站长手写信逐字打出（`#intro`，手写体 Ma Shan Zheng via Google Fonts CDN+swap，失败回退系统楷体；若要站主原生笔迹，需把手写样张做成字体文件后自托管替换）；点击/按键跳过、总时长硬上限、reduced-motion 与同会话二次访问直接跳过（sessionStorage `csc_intro_done`）。品牌模块改为全屏宽 `.hero`：夜=2D 星空 canvas（分层：深空底/银河带/星云/尘埃星/三层闪烁星/低频流星，静态层离屏缓存，DPR 移动端 1.5 上限，白天跳帧省电，reduced-motion 画静态一帧），昼=个人站同款暖渐变 `#f5e6d3→#f0d4c0→#e8c8d8→#d4c0e8→#b8d0f0` + 太阳光晕，两层靠 `--t` 交叉淡化。footer 仅保留「姊妹应用：睡眠站台 (Android)」一行，`cloudLine` 已删
- **整页天空 + 固定导航 + 手书灯箱（2026-09-10 站主要求）**：星空/晴空从 hero 区改为**整页固定背景**（`.page-sky` fixed inset 0，内容卡自带实底不受影响，白天整页即个人站同款暖渐变，白天 sub/accent 已加深保住对比度）；导航栏 fixed 吸顶（毛玻璃底 `rgb(var(--bg-rgb)/.78)+blur`，`--bg-rgb` 由主题脚本同步插值），内容区 `body padding-top:56px` 让位；导航新增「手书」→ 灯箱 `#letterBox` 打开 `assets/shoushu.jpg`（站长手书原稿照片，2834×3299 原图压缩至 1546×1800/401KB 存仓库 assets/，点击任意处/ESC 关闭）。打字入场动画保留不变
- **品牌更名 + 中英双语（2026-09-10 站主要求）**：品牌名改为「电子安眠药」（EN: Cyber Sleeping Pills），用手写体渲染；问候语（夜深了/未寝人##）整行移除。全站中英双语：词典 T={zh,en} 在主脚本顶部，静态文案走 applyLang() 按 id 刷写，动态文案走 t(key,...args)（带插值的词条返回函数，**无参调用返回函数本身**）；语言存 localStorage csc_lang（**不进契约**，仅 UI 偏好），导航最左「EN/中文」切换，`?lang=en` 强制。内容标题（样例/用户发布）不翻译。注意：nav 按钮 id 是 navPublish（不是 navPrescribe）；样例评分键 csc_sample_ratings 与 csc_lang 均为本地 UI 键，与契约数据分离
- **可添加类型标签 + 磨砂卡片 + 网站介绍（2026-09-10 站主要求）**：失眠类型改为**可添加标签**——发布表单类型项是文本框（datalist 提示内置四类），自定义标签 ≤12 字经 `normalizeTag` 归一（内置命中→key，否则原样入库），提交时会过 AdGuard；契约 §2 取值域随之扩展并升 **v1.1**（APP 端下次更新需兼容未知 type 原样显示）。样式：类型标签与筛选 chips 一律去外框、`# 标签` 形态，激活=藕荷紫。推荐卡片去边框改**磨砂玻璃**（`rgb(var(--card-rgb)/.55)+backdrop-blur 14px`，`@supports` 回退实底；hover 提高不透明度）——依赖 `--card-rgb`，主题脚本已同步插值。副标题广告语也用手写体。导航新增「网站介绍」→ `playIntro()` 重播入场动画（首载自动播逻辑不变，见前条）
- **类型星图 + 原因搜索 + 两段式入场（2026-09-10 站主要求）**：筛选 chips 行升级为**类型星图节点**（`#tagNodes`，夜=星星/昼=光点，含「无类型」节点收录未分类推荐，自定义标签自动成节点）；默认榜单**收起**（显示「点亮一颗星」指引），点节点展开/再点收起；新增**失眠原因搜索框** `#searchBox`（输入即搜：标题+类型标签+内置原因词表匹配，搜索时忽略节点筛选）；导航「网站介绍」入口暂时注释（`playIntro()` 重播逻辑保留，恢复取消 nav 注释即可）；入场动画改**两段式**——第一次交互显示全文并停住，第二次才进入网站（stage: typing→full→gone）。
- **分享卡片/SEO 基建（2026-09-12 站主定址）**：正式地址 = `https://alidadei.github.io/cyberSleepingPill/`。og:/canonical/twitter:card **静态写在 `<head>`**（微信/QQ/Telegram/百度抓分享卡片不执行 JS，动态注入等于没有——曾用 JS 注入方案已删，测试红线禁止回归）；`og:image = assets/og-cover.jpg`（1200×630 夜间首页星空实拍，**基线 JPEG**（渐进式对老抓取器兼容差），生成方式：headless Chrome `--headless=new --force-prefers-reduced-motion --window-size=1200,630 --virtual-time-budget=8000 --screenshot=… "?day=0"`，reduced-motion 让两段式入场直接跳过）。**换域名三处同步**：head 静态块、`robots.txt`、`sitemap.xml`。实测（2026-09-12）：**微信**聊天框直接贴 URL 只显示纯文本气泡——平台对所有外部站点的行为，非页面问题；卡片只在「内置浏览器 → 右上角菜单 → 发送给朋友」时生成，标题取 `<title>`（已改为「电子安眠药 · 犯困内容打分网站」与 og:title 一致），缩略图无公众号 JS-SDK 不可控（完整方案需认证公众号+域名校验，暂不做）。**飞书**卡片有标题/描述、无图——github.io 图片抓取不稳所致，已补 og:image:secure_url/type/alt 并转基线 JPEG；若仍无图属飞书侧抓取限制（可选缓解：图床镜像，暂不做）。
- **定位陈述 + 收藏（2026-09-12 站主拍板）**：副标题定为电梯陈述「致失眠焦虑刷手机的你：这里是刷着刷着能让你睡着的地方」（EN 见 T.en.subtitle），meta description / og:description / README 首行同步——定位=娱乐放松与助眠并重（"刷手机和助眠两不误"），与 小睡眠 类纯工具站差异化。**语言分区讨论决议：不分区**，混排+评分排序即筛选；语言标注/筛选 UI 等真实英文流量出现再议。**收藏已上线**：本机键 `csc_favorites`，2026-09-17 起为 **`{key,title,url,type}` 对象数组**（key=urlKey；旧版纯字符串条目读取时自动迁移；**不进契约**）；每张卡右上书签按钮 `.fav`（样例与社区通用，aria-pressed）；导航「收藏」→ `showRankingPage('favs')` 榜单页型态（徽标 `# 收藏`，空态引导点亮书签）；同链接同时存在样例与社区条目时**社区条目优先去重**；收藏页内取消收藏卡片即时离场（rerenderRanking）；**站外/APP 导入的池外收藏直接成卡**（title 空则回退域名）。收藏页头部带 **导出收藏/导入收藏**（2026-09-17）：导出文件名与 APP RelaxDataIO 完全一致 `sleep_station_favorites.json`（RelaxItem 数组形状：id/title/url/isCustom/type，Gson 宽松兼容 → **APP「睡眠站台」v1.3.3+ 导入零改动**）；导入按 urlKey 合并去重、原样保留用户 URL 与标题。评论功能（站主考虑中，未实现）：方案=Supabase comments 表(pick_id/uid/nickname/text/created_at)+RLS(可读可插不可改删)+AdGuard 同套词表+同 uid 冷却+站长后台手动删起步；**评论属网站域数据，不进 CommunityPick 契约**，APP 同步留 v1.2 再议；建议内容 30–50 条、有首批日活后再上（空评论区劝退）。
- **链接失效处理（2026-09-17）**：浏览器受 CORS 限制无法探测外链死活 → 采用社区举报制。云端新表 `link_reports`（(pick_id,uid) 复合主键 = 一人一票；anon 可读可插、无 update/delete 策略；SQL 在 `docs/supabase-schema.sql` 尾部，**已于 2026-09-17 由站主执行并验证**（anon 插入 201、删除 401、巡检真跑通过；表内遗留一行 `uid='selftest-zcode'` 的权限自测数据，pick_id=0 不对应任何条目，无副作用，介意可在 dashboard 删））。网站端：社区条目卡新增 ⚠ 举报按钮（样例卡不渲染；LocalStore 无云端模式也隐藏），`DEAD_THRESHOLD=2`：同一 pick_id 被 ≥2 个不同 uid 举报 → 卡片置灰（`.stale`）+ 红色「⚠ 多人报告：链接可能已失效」徽标（`var deadReports` 由 `refresh()` 时 `SupabaseStore.fetchDeadReports()` 填充）。站长清理流程（汇总查询 / 删死链 + 举报）写在 schema 尾部注释。`link_reports` 为网站域数据，**不进契约 §1**，APP 无需感知。
  - **自动化巡检（2026-09-17）**：`tools/link-check.mjs`（零依赖 Node 18+）+ `.github/workflows/link-check.yml`（每日 UTC 21:17≈北京 5:17 + 手动触发）。服务端无 CORS 限制，直连探测：B站走开放 API（code -404/-403 判死）、YouTube 走 oembed（404 判死）、其它站点 GET 探头即止（404/410 判死；403/429/5xx/超时=未知不判死，防反爬误杀）。死链以 `uid='bot-linkcheck'` 向 link_reports 投一票（唯一约束防重复）→ 机器人 + 1 个真人即触发网站端置灰徽标；链接复活且无真人举报时自动撤票（需仓库 Secret `SUPABASE_SERVICE_ROLE`，仅投票模式零 Secret 也可跑——anon key 本就是公开值，脚本内置缺省）。`--dry-run` 只探测不写；`--prune` 自动删除确认死链条目（需 SERVICE_ROLE，默认**不**在 Actions 里启用，删除类操作保持人工触发）。前提：link_reports 建表 SQL 已执行。
- **导航 导出/导入 下线（2026-09-17 站主决定）**：社区榜单的文件迁移通道（`cyberSleep_picks.json` + 文件导入）从导航移除——「功能只有站长会用，要数据直接读云端」。随之删除：`coercePick`（契约文件合规化）、`ioToast`/`ioTimer`（全局 toast）、`#fileImport` 输入、i18n 的 nav_export/nav_import/import_ok/import_bad_fmt/import_fail 词条。**附带收益**：文件导入曾是绕过 AdGuard 词表的批量发布口子，已堵上。收藏页的 导出收藏/导入收藏（个人书签 ↔ APP 互通）**不受影响**。测试红线：navExport/navImport/fileImport 不得回归（id 列表已除名）；「APP 同款」徽章的行为覆盖改由直写本机库 + `sandbox.refresh()` 播种。
- 视觉与文案规范以仓库外 `网站审美规范.md` 第 12 节为准（配色与时辰条款除外，见上）；本站不做手动亮暗开关（跟时间走是站主要求）
