# AGENT_HANDOFF · 电子安眠药（cyberSleepingPill）开发接手指南

> 写给下一个接手本项目的 AI agent。读完这一篇即可开工，不需要问用户任何背景问题。
> 最后更新：2026-09-24（若比当前日期旧很多，先 `git log --oneline -20` 补课再动手）。

## 0. 一句话定位

「电子安眠药」（曾用名：赛博睡眠社区 cyberSleep）是安卓 APP **「睡眠站台」**（`R:\Code\MY project\guangnaozhong\fossify-clock`，GitHub: Alidadei/MySleep，GPL-3.0）的姊妹网站：一个**专门收录让人犯困内容并打分**的社区，定位陈述（站主定稿）：**「致失眠焦虑刷手机的你：这里是刷着刷着能让你睡着的地方」**——娱乐放松与助眠并重，与「小睡眠」类纯工具差异化。零依赖单文件站，部署于 GitHub Pages：`https://alidadei.github.io/cyberSleepingPill/`。**两端共享数据契约**（`docs/DATA_CONTRACT.md`）。

用户身份：中国大陆个人开发者，**预算为 0**，产品哲学：无广告、无追踪、无账号、真实分享者社区。交流用简体中文。**用户最新口头指令 > 任何规范文档**（历史上多次推翻审美/文案规范，偏离须记入 §6 档案）。

## 1. 环境与可用工具（改代码前先知道有什么）

### 1.1 开发与验证三件套（每轮改动必走）
```bash
# ① 语法：抽出内联 <script> 做语法检查
awk '/^<script>$/{f=1;next} /^<\/script>$/{f=0} f' index.html > /tmp/s.js && node --check /tmp/s.js
# ② 行为回归：零依赖 DOM 桩测试（当前 170 项断言，全绿才算完；含 /adm 红线扫描与样例下线红线）
node tests/dom-test.mjs
# ③ 本地预览（后台常驻；跨会话可能被回收，用前先 curl -o /dev/null -w "%{http_code}" http://127.0.0.1:8642/ 探活）
python -m http.server 8642 --bind 127.0.0.1
```

### 1.2 真实浏览器视觉验证（两招，IAB 内置浏览器经常起不来，别依赖它）
- **无需交互**：headless Chrome 一次性截图——`"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --force-prefers-reduced-motion --window-size=1280,900 --virtual-time-budget=8000 --screenshot=out.png "http://127.0.0.1:8642/?day=0"`。`--force-prefers-reduced-motion` 会触发站内逻辑跳过两段式入场；`?day=0`/`?day=1` 强制夜/昼主题。
- **需要交互**（点按钮、开弹层、看收藏页）：Node 24 内置 WebSocket 直连 CDP——`--remote-debugging-port=9223` 启动 → `GET /json/list` 拿 webSocketDebuggerUrl → `Runtime.evaluate` 执行页面 JS（可直接调 `showRankingPage('favs')`、改 `deadReports` 等全局）→ `Page.captureScreenshot`。仓库**没有** playwright/puppeteer，零依赖红线别为测试引入它们。

### 1.3 Supabase（云端已 live）
- 项目：`ttvaedbukdwpvdtmodeo.supabase.co`（Singapore 免费档）。anon key 是**公开凭据**（内嵌 index.html 顶部 `SUPABASE = {...}`），权限全靠 RLS；service_role 绝不进仓库/文档。
- 表（均已建好）：`community_picks`（社区榜单）、`user_profiles`（匿名画像）、`link_reports`（链接失效举报，2026-09-17 上线）。
- **Supabase CLI v2.117.0 已 npm 全局安装，但尚未 login**。用户自己跑一次 `supabase login`（浏览器授权）后，`supabase db query --linked -f any.sql` 可直连云端执行任意 SQL（管理面全打通，走 Management API 无需数据库密码）。MCP 配置存在但 access token 是占位符（`~/.zcode/cli/config.json`）——2026-09-19 实测 `list_projects` 返回 Unauthorized，仍等于没配，DDL 继续走「给站主粘贴 SQL → Dashboard 执行」流程。
- **service_role（站长后台用）获取**：Dashboard → 项目 `ttvaedbukdwpvdtmodeo` → Settings → API Keys → **Secret keys** 新建一把复制（`sb_secret…` 开头；若 Legacy 区未禁用，`service_role` JWT 等效）。**能存放的地方只有两处**：/adm 运行时内存（粘贴进密码框，刷新即丢）、被 `.gitignore` 忽略的本地文件（如 `service_role.local.txt`，模式 `service_role*` / `*.local.txt` / `*.secret` / `.env` 有测试断言保护）——绝不进仓库、聊天、截图、云盘。
- Supabase 技能文档（`.agents/skills/supabase/SKILL.md`）有全部 REST curl 模板与红线。
- GitHub Actions：`.github/workflows/link-check.yml` 每日 UTC 21:17 自动跑死链巡检（见 §2）；gh CLI 未登录，无法手动触发，改 workflow 定时/参数即可。

### 1.4 部署
纯静态无构建，`git push origin main` 即部署（Pages 构建延迟 1–2 分钟，验证线上用 `curl "https://alidadei.github.io/cyberSleepingPill/?bust=随机数" | grep 特征串` 轮询，别假设立即生效）。

## 2. 开发现状（2026-09-17）

```
cyberSleepCommunity/
├── index.html                  # 单文件站全部 HTML/CSS/JS（当前 ~3000 行）
├── adm/index.html              # 站长后台：人工判活/判死/清举报/删条目 + 留言审核（noindex，永不内嵌密钥）
├── data/index.html             # 数据页：画像/推荐/链接健康统计，密钥门禁 + 30 秒自刷（noindex）
├── tests/dom-test.mjs          # 零依赖行为测试（vm 桩 + 结构冒烟 + 170 项断言，含 admin/样例下线红线扫描）
├── tools/link-check.mjs        # 死链巡检脚本（零依赖，GitHub Actions 每日跑；跳过站长已判定条目）
├── .github/workflows/link-check.yml
├── docs/                       # DATA_CONTRACT / supabase-schema / adguard-rules / capacity-test / 本文件
├── assets/                     # og-cover.jpg（分享封面）+ shoushu.jpg（手书原稿）
├── robots.txt / sitemap.xml
└── README.md
```

**已上线功能**（细节见 §6 档案）：昼夜时辰渐变主题（夜藕荷紫/昼琥珀棕，`--t` 插值）、整页星空 canvas、手写信两段式入场、类型星图节点（点击展开榜单，**自定义标签同义词折叠**）、失眠原因搜索、全站中英双语、静态 og:/canonical 分享卡片、推荐留言 note（契约 v1.3，卡片随卡展示）+ **每条内容一个留言板**（评论功能解冻形态）、收藏（书签 + 收藏页 + 与 APP 同格式导出/导入）、链接失效举报（⚠ 按钮 + ≥2 人置灰徽标 + Actions 自动巡检 + 站长后台三层判定）、数据页 /data（密钥门禁的画像/推荐/链接健康统计）、排行榜覆盖层 + 移动端返回手势、汉堡菜单。**云端四表 live**（community_picks / user_profiles / link_reports / comments），schema v1.4–v1.6 均已执行（2026-09-23）：`admin_verdict` / `note` 列、`note_len` 约束、`comments` 留言表全部生效，后台判定、留言落库、留言板全功能；云端现有数据极少（个位数条目）。

**有意下线的东西（不要恢复）**：导航栏 导出/导入（社区数据以云端为唯一通道，顺带堵掉了绕过 AdGuard 的批量导入口子）；网站介绍按钮（注释保留）；emoji 图标（仅历史品牌位）；**内置精选样例+示例评分（2026-09-23 站主指令整体删除，站内只展示真实社区条目）**。

## 3. 铁律（改代码前必读）

1. **改数据结构先改 `docs/DATA_CONTRACT.md` 并升版本号**，三处同步：网站 `index.html`、APP `RelaxStore.kt`、`adguard-rules.json`。网站域数据（收藏 `csc_favorites`、`link_reports`、`comments` 留言表）**有意不进契约**，别手痒合并。
2. **零依赖单文件**。不引入框架/npm 构建链/SDK；云端用原生 fetch 调 PostgREST。
3. **绝不引入广告、追踪器、Cookie 横幅**；新第三方静态资源也要先过问站主。
4. `CommunityPick.id` 是 epoch 毫秒 number（APP 端 Long）；排序规则（平均分→评分数→addedAt）两端一致。
5. 中文为主 UI；深浅主题跟时间走（`--t`），**不做手动亮暗开关**。
6. 改完必跑 §1.1 三件套；改行为必补断言；**动过 HTML 结构/视觉必须在真实浏览器截图验收**（桩看不出结构损伤与排版，血泪教训见 §7）。
7. 测试桩约定：测试用 `sed`/python 改过测试文件后，Edit 工具会报"file modified"——重新 Read 再 Edit。桩对 vm 沙盒的约定：顶层 `function`/`var` 声明会泄漏进沙盒全局（`sortPicks`、`refresh`、`deadReports` 可直接从测试触达），`const/let` 不会——需要测试注入的状态用 `var`（如 `deadReports`），其余用 `let/const`。
8. **/adm（站长后台）永不内嵌任何密钥**：service_role 只能运行时粘贴、仅存页面内存（刷新即丢）；页面公开可访问（robots Disallow + noindex、主站无入口链接），安全完全依赖密钥保密。数据渲染只许 textContent + http(s) 协议白名单（用户提交内容 = 不可信输入，防 XSS 偷内存里的密钥）；测试有红线扫描（JWT/sb_secret 字样、innerHTML、外链脚本），别"修复"掉。密钥本地持久化的唯一允许形态 = `.gitignore` 忽略的文件（如 `service_role.local.txt`），获取步骤见 §1.3。

## 4. 未来任务（按优先级）

0. **无待办**——schema 升级全部执行完毕：v1.4/v1.5（2026-09-23，admin_verdict / note 列）、v1.6（同日，`note_len` CHECK + `comments` 留言表）均已由站主在 Dashboard 执行、agent 用 anon key 验证生效。留言板全功能。今后 schema 升级照旧：`docs/supabase-schema.sql` 尾部追加新段交站主粘贴，或站主配好 MCP access token 后由 agent 用 `apply_migration` 执行。
1. **APP 端云端同步（P1 收尾）**：`RelaxStore.kt` 是预留换源点，需写 `RemoteStore.kt`（HttpURLConnection 调同一 REST）+「社区云同步」开关。网站端已就绪。
2. **内容量冷启动**：样例下线（2026-09-23）后站内只有真实社区条目，当前仍是个位数，目标 30–50 条（收录眼光是站主的活，agent 可协助批量抓取/整理候选）。样例下线后首页/空类型显示空态引导文案，属预期，别当 bug 修。
3. **评论功能（2026-09-23 解冻上线，形态=每条内容一个留言板）**：点社区卡片「留言」按钮 → 独立弹层（列表时间正序 + 自己 uid 带「我」标记 + 打开内容链接 + 输入发布）。闸门：AdGuard（提交时）+ 同 uid 60s 冷却（localStorage `csc_last_msg`）+ ≤200 字 + RLS 无改删策略；按需拉取不随页面加载（保 egress）。站长审核在 /adm「留言审核」区。原冻结方案（等有日活）被站主此令取代。
4. **语言标注**：决议=不分区、混排；等真实英文流量出现后做"标题 CJK 启发式标注 + 筛选 chip"（契约零改动方案已议）。
5. **APP 收藏增强**：见 `guangnaozhong/fossify-clock/收藏功能增强计划.md`（一键收藏/统一 urlKey/类型标签；网站→APP 收藏文件互通已通）。
6. **可选**：巡检脚本 `--prune` 自动删死链（需 SERVICE_ROLE secret，删除类操作保持人工触发）；自定义域名（顺带解决飞书/微信抓取 github.io 不稳的问题）。
7. **远期**：与 APP「寻找张怀民」联动留言墙。（原「真实评分替换样例演示值」已随 2026-09-23 样例整体下线作废——站内现在只有真实评分。）
8. **承载预案（触发式，未到期）**：云端条目攒到 **200–300 条**时，把 `SupabaseStore.load()` 的全量拉取（limit=1000）改分页/按需 + `select=*` 收窄为具名列——否则月度 egress 配额（免费档 5GB/月，2026-09-21 官方定价页核实，缓存份额因 PostgREST 不缓存用不上）会变成每月万次访问的量级。完整测算与复测脚本见 `docs/capacity-test.md`；2026-09-21 实测 60 并发全流程 + 100 脉冲零失败，在那之前不动。
9. **标签语义巡检（常备轻流程，站主 2026-09-23 拍板）**：`TYPE_SYNONYMS` 同义词表**有意不做穷举**，漏词由语义巡检兜底——用 anon key 拉云端去重 type（`community_picks?select=type&limit=1000`），凡表外新自由标签，由**当时维护本仓库的 AI agent 做语义归类判断**（站主明确：模型不写死，GLM/Claude/GPT/网页聊天模型均可——判定发生在维护会话里，**不进网站运行时、不接任何模型 API、不让访客浏览器跑模型**，零依赖/零预算/无追踪红线不动）。流程：扫描 → 向站主给出「折叠进某官方类 / 保留自定义」建议 → 站主点头 → 主站 `index.html` 与 `/data` 两张 TYPE_SYNONYMS 各补一词 + 测试断言 → 同 commit。触发时机：每次动主站或 /data 时顺手扫一遍；站主喊「扫标签」随时执行。首扫 2026-09-23：云端仅 `null` + 「兴奋睡不着」（已在表），零漏词。

## 5. APP 端速查（跨项目协作时）

- 代码：`R:\Code\MY project\guangnaozhong\fossify-clock`（独立 git 仓库，GitHub: Alidadei/MySleep）；构建与版本号见该仓库 `FORK_NOTES.md`
- 助眠相关：`helpers/RelaxStore.kt`（收藏+社区数据，"backend lands → swap point"）、`helpers/PicksRepository.kt`、`helpers/AdGuard.kt`、`helpers/InsomniaTypes.kt`、`helpers/LinkParser.kt`、`fragments/RelaxFragment.kt`（全部 UI）
- 有 Robolectric 测试：`./gradlew :app:testFossDebugUnitTest`，动 RelaxStore 前先跑通

## 6. 设计决策与取舍档案（不要"修复"它们）

> 按时间序。每条都是站主拍板或实战教训，推翻任何一条前先问站主。

- 打分后 ✓ 停留 1.5s 才刷新排序（让归位自然）；「APP 同款」徽章用内联 SVG 链条（审美规范规定 emoji 仅品牌位，现已连品牌位 emoji 也移除）；卡片整卡可点用标题锚点 `::after` 拉伸实现，评分/星星行靠 `z-index` 保持可点
- 配色：夜=藕荷紫 #B89BBF 系、昼=琥珀棕×雾杏粉系，`<head>` 时辰脚本按 5–8/17–20 点 smoothstep 连续插值（`--t`），页面久开每 10 分钟缓移；`?day=0/1` 调试；对比度昼间已核 ≥4.5:1。审美规范 §12.3 旧色板作废，别改回去
- B 站标题抓取走**开放 API + JSONP**（API 无 CORS 头，别改回 fetch）；其余站点直连读 `<title>`，CORS 拦截时静默回退域名标题（有意降级）；**永远不引第三方 CORS 代理**（隐私红线）
- ~~样例评分模拟~~ **已随 2026-09-23 样例整体下线作废**（`csc_sample_ratings` 键已不存在，勿恢复）。收藏键 `csc_favorites` 存 `{key,title,url,type}` 对象数组（key=urlKey，旧字符串条目读取时自动迁移），**不进契约**
- 全屏手写信入场（Ma Shan Zheng 手写体 + sessionStorage 只播一次 + reduced-motion 跳过 + 硬上限；两段式：首次交互显示全文停住、二次交互才进站）；整页星空 canvas（分层静态离屏缓存，DPR 移动端 1.5 上限，白天跳帧）
- 品牌「电子安眠药」手写体；副标题=定位陈述「致失眠焦虑刷手机的你：这里是刷着刷着能让你睡着的地方」（副标题/meta description/og:description/README 四处同源，改一处同步四处）
- 分享卡片 og:/canonical **静态写在 head**（微信/QQ/Telegram/百度抓卡片不执行 JS，动态注入等于没有；测试红线禁止回归 JS 注入）。og:image=assets/og-cover.jpg（1200×630 基线 JPEG）。实测：微信贴链接永远纯文本（平台行为，卡片只在内置浏览器菜单分享时生成）；飞书抓得到标题但抓不动 github.io 图片（平台限制，无解，治本=自有域名）
- 收藏页 = `showRankingPage('favs')` 榜单页型态；同链接样例+社区并存时**社区条目优先去重**；池外收藏（APP 导入的站外内容）直接成卡；导出文件名/格式与 APP `RelaxDataIO` 完全一致（`sleep_station_favorites.json`，RelaxItem 数组，Gson 宽松兼容 → APP 导入零改动）
- 链接失效：浏览器 CORS 探测不了外链 → 社区举报制（`link_reports` 表，(pick_id,uid) 一人一票，insert-only RLS）；置灰报警为**双确认**（2026-09-17 站主定稿，缺一不可，起因=站主两台设备自测误触发）：机器人 `bot-linkcheck` 每日探测判死 **AND** ≥2 台设备人工举报（`DEAD_HUMAN_THRESHOLD=2`）→ 「⚠ 多人报告 + 机器验证：链接可能已失效」徽标；点 ⚠ 弹「反馈链接失效」确认浮窗（说明机制、确认才上报、成功自动关闭，`openDeadDialog`）；`tools/link-check.mjs` 每日 Actions 自动探测死链投 `bot-linkcheck` 一票（404/410/B站-404-403 才判死，反爬模糊态不判死）；表已建好并验证（2026-09-17）
- **站长后台 /adm（2026-09-19）**：报警升级为**三层规则**——站长判活（`admin_verdict='alive'`）永久压过机器人与一切举报、站长判死直接报警（无需双确认，徽标文案「⚠ 站长核实：链接已失效」）、无判定才走自动双确认；巡检机器人跳过已判定条目（人工裁决优先）。后台公开可访问但只读，管理操作需运行时粘贴 service_role（铁律见 §3.8）；anon 授权收缩为列级（update 仅 ratings/recommend_count，判定列 service_role 专属，见 schema v1.4）——这次收紧顺手堵了旧档案里「anon 可覆盖任意列」的已知限制。顶部常驻导航（数据页入口 + 返回主站）。**配色 = 暖白简化调色板**（站主指定采用 `/research-html` 色板：奶油底 #faf8f5 + 暖棕 #8d6e63，红 #b05050 仅危险语义），有意区别于主站深色星空，别"统一"回去
- **数据页 /data（2026-09-19）**：密钥门禁（同 /adm，service_role 运行时粘贴仅内存，进入前不渲染任何数据）；顶部常驻导航（站长后台入口 + 返回主站）；总览/用户画像/推荐内容/链接健康四区，进入后每 30 秒自动刷新；纯客户端聚合（三表全量拉取 limit 2000/5000，规模大后应改 PostgREST 聚合或视图）；画像标签映射与站内 `AGE_GROUP_KEYS/GENDER_KEYS/EDU_KEYS` 一致（未知值原样显示）；报警口径与主站三层规则同源（含 admin_verdict）；配色同 /adm 暖白简化；noindex + robots Disallow + 主站无入口
- **样例整体下线 + 同义词折叠 + 推荐留言（2026-09-23，站主三项指令，契约 v1.3 / schema v1.5）**：① 内置精选样例（BUILTIN 四条+示例评分+csc_sample_ratings+「APP 同款」徽章+【样例】前缀）**全部删除**——推翻 2026-09-10「每型一条样例」决定，站内只剩真实社区条目，空类型显示空态引导；测试有「无 BUILTIN/sampleRating/【样例】残留」红线，勿恢复。② 自定义标签**同义词折叠**（`TYPE_SYNONYMS` + `normType`）：写入口径（normalizeTag）与渲染口径共用一表，「兴奋睡不着」→`excitement`（站主云端真实数据里的首例同义分裂）；`/data` 数据页同源一份，类型分布不再分裂；无法归类的自由标签仍按 v1.1 原样保留。同义词表**有意不追求穷举、也绝不在运行时集成任何语义模型/API**（站主 2026-09-23：语义判定由维护 agent 离线做、模型不写死，常备流程见 §4.9）。③ 新增**推荐留言 note**（契约 v1.3 选填字段）：提交框 maxlength=60、与标题/URL/标签一起过 AdGuard、卡片「留言」居中样式展示、同 URL 合并保留首条；云端列 `note`（schema v1.5，列级 insert 授权已含），**DDL 未执行时 add 自动降级为无留言重试**（推荐本体不失败）；APP 端 Gson 容忍缺失，代码零改动。CDP 截图抓过一次 note 靠左不居中的视觉问题——卡片内容全是居中风格，新块级元素记得 `text-align:center`。同日站主手机端反馈：长标题换行时序号被 `.head` 的 `justify-content:center` 挤成独占一行居中、与短标题卡不一致 → **≤640px 断点内 .card .head 改 `flex-start` + rank 加 min-width 2.2em**；同日二轮拍板：**标题独占一行（.t flex-basis:100%），评分/收藏/举报三按钮恒同一行**（移动端排行卡统一为「序号→标题→按钮行→居中 meta→留言」结构，桌面端居中审美不变，勿"统一"回桌面）。
- **卡片按钮全部带文字（2026-09-24，站主指令「收藏 和 网址失效反馈 两个按钮也需要文字提示」）**：收藏/失效按钮从纯图标改为「图标+文字」胶囊（收藏→已收藏、失效反馈→已反馈，EN Save→Saved、Dead link?→Reported），与 评分☆/留言板 统一 13px 胶囊族；i18n 新键 `fav_btn/fav_btn_on/dead_btn/dead_btn_done`（aria-label 仍用全文案 `fav_add/fav_remove/dead_report_tip/dead_reported`，别合并）。≤640px 断点内 `.head` gap 5px + 四按钮左右 padding 收到 8px——否则 360px 窄屏内容区 304px 装不下 310px 的按钮行，留言板会被挤到第二行（CDP 实测 360/390/414 一行通过；320px 极旧设备允许换行，flex-wrap 是设计行为）。测试 12 段新增 EN `Save` 断言、12b 收藏文字切换断言、12d 源码扫描（dead 键中英+切换表达式）。记住移动端按钮行预算：按钮宽度和 ≤ 内容区宽度，加按钮先量 360px。
- **留言板（2026-09-23，站主指令「点开后跳到单独的留言界面」）**：社区卡片新增「留言板」按钮（与举报同门控：仅云端 Store 渲染）→ 独立弹层 `openMsgBoard`（z-70，ESC/返回手势/点遮罩均可关，popstate 用 `msgPopping` 旗标防止"关板顺带关榜"）。发布闸门：AdGuard → 60s/uid 冷却 → 200 字截断；纯 textContent。**输入框不自动聚焦**（站主明确：手机上弹键盘会把板顶出屏外，让用户自己点）；板身定高 `min(75vh,640px)` + 列表区 flex 撑满（站主要求"做长一点"）；背景 backdrop blur + 入场动画（reduced-motion 全局豁免已覆盖）。入口不做成"整卡点击"——卡片主点击仍是打开外部内容（产品核心循环），别改。schema v1.6：comments 表 + note_len 约束；DDL 未执行时留言板显示加载失败（不炸主站）。
- ~~评论功能（未实现，方案冻结）~~ **2026-09-23 已解冻上线**（形态改为"每条内容一个留言板"，见 §4.3）
- 导航 导出/导入 已下线（2026-09-17）：社区数据云端为唯一通道；附带堵住文件导入绕过 AdGuard 的口子

## 7. 开发经验与教训（每条都交过学费）

1. **验证金字塔**：`node --check` → DOM 桩 170 项 → headless 截图 → CDP 交互截图。桩的盲区=HTML 结构损伤与一切视觉问题；跳过最后一步交付过一次"样例全空"事故（§3.6）。CDP 注入注意：Node 24 内置 WebSocket 是 EventTarget 风格（`addEventListener`，没有 `.on()`）。
2. **分享卡片类功能必须静态写 head**——一切"运行时注入元数据"的方案对不执行 JS 的爬虫无效。
3. **存储结构升级别忘了写 key**：收藏从 urlKey 字符串升级为对象时，第一版漏存 `key` 字段，读回全被丢弃——schema 变更后立刻跑真实链路测试，别只看"没报错"。
4. **bash heredoc 反引号会吞字**：写含反引号/`$` 的内容用 `<<'EOF'`（带引号）或 python；`sed -i` 改文件后 Edit 工具会拒绝（文件状态过期），重新 Read 即可。
5. **多入口可能并行改仓库**：push 被拒（non-fast-forward）时 `git pull --rebase`，重复补丁会自动 drop；推送前先 fetch 看一眼。
6. **GitHub Pages 构建延迟 1–2 分钟**：验证线上用轮询（60s×N 次 curl grep），别在 40 秒时误判"没生效"。
7. **动作前探活**：本地预览服务器跨会话常被回收，curl 200 再用；IAB 内置浏览器 "webview not ready" 反复出现，直接切 headless Chrome/CDP，别耗在重试上。
8. **测试断言挂了先加诊断输出再猜**（ok() 的 extra 参数会打印），本仓多次"灵异失败"最后都是状态没进预期分支。
9. **外部服务的能力边界先查证再写方案**：GitHub Sponsors 大陆不可收款、飞书不渲染 github.io 预览图、浏览器探测不了跨域死活——都查证过，别在方案里复活这些死路。
10. **git push 到 github.com 失败按报错形态对号入座**：① `SSL_ERROR_SYSCALL` = HTTP/2 被干扰 → `git -c http.version=HTTP/1.1 push`（2026-09-17）；② `Failed to connect to 127.0.0.1 port 7890` = git 配置的代理没开，直连也会被墙（reset/timeout）——先 `netstat -an | grep LISTENING` 找实际代理端口（Clash Verge 新默认 7897，2026-09-19 实测），`git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=... push` 即过。另：`git push | tail` 吞退出码，重试循环必须判断 git 本身的退出码。
11. **免费档永远别做破坏性压测**：Supabase 前面是 Cloudflare，压测工具往死里打可能被判滥用封项目——承载问题用「真实访客级」温和模拟回答就够了（分档 1/10/30/60 并发全流程 + 100 脉冲，只读约 400 请求），方法、脚本、判读标准已沉淀 `docs/capacity-test.md`，复测直接用，别另起炉灶。
