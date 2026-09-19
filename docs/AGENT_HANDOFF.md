# AGENT_HANDOFF · 电子安眠药（cyberSleepingPill）开发接手指南

> 写给下一个接手本项目的 AI agent。读完这一篇即可开工，不需要问用户任何背景问题。
> 最后更新：2026-09-19（若比当前日期旧很多，先 `git log --oneline -20` 补课再动手）。

## 0. 一句话定位

「电子安眠药」（曾用名：赛博睡眠社区 cyberSleep）是安卓 APP **「睡眠站台」**（`R:\Code\MY project\guangnaozhong\fossify-clock`，GitHub: Alidadei/MySleep，GPL-3.0）的姊妹网站：一个**专门收录让人犯困内容并打分**的社区，定位陈述（站主定稿）：**「致失眠焦虑刷手机的你：这里是刷着刷着能让你睡着的地方」**——娱乐放松与助眠并重，与「小睡眠」类纯工具差异化。零依赖单文件站，部署于 GitHub Pages：`https://alidadei.github.io/cyberSleepingPill/`。**两端共享数据契约**（`docs/DATA_CONTRACT.md`）。

用户身份：中国大陆个人开发者，**预算为 0**，产品哲学：无广告、无追踪、无账号、真实分享者社区。交流用简体中文。**用户最新口头指令 > 任何规范文档**（历史上多次推翻审美/文案规范，偏离须记入 §6 档案）。

## 1. 环境与可用工具（改代码前先知道有什么）

### 1.1 开发与验证三件套（每轮改动必走）
```bash
# ① 语法：抽出内联 <script> 做语法检查
awk '/^<script>$/{f=1;next} /^<\/script>$/{f=0} f' index.html > /tmp/s.js && node --check /tmp/s.js
# ② 行为回归：零依赖 DOM 桩测试（当前 141 项断言，全绿才算完；含 /adm 红线扫描）
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
├── adm/index.html              # 站长后台：人工判活/判死/清举报/删条目（noindex，永不内嵌密钥）
├── data/index.html             # 数据页：画像/推荐/链接健康统计，密钥门禁 + 30 秒自刷（noindex）
├── tests/dom-test.mjs          # 零依赖行为测试（vm 桩 + 结构冒烟 + 141 项断言，含 admin 红线扫描）
├── tools/link-check.mjs        # 死链巡检脚本（零依赖，GitHub Actions 每日跑；跳过站长已判定条目）
├── .github/workflows/link-check.yml
├── docs/                       # DATA_CONTRACT / supabase-schema / adguard-rules / 本文件
├── assets/                     # og-cover.jpg（分享封面）+ shoushu.jpg（手书原稿）
├── robots.txt / sitemap.xml
└── README.md
```

**已上线功能**（细节见 §6 档案）：昼夜时辰渐变主题（夜藕荷紫/昼琥珀棕，`--t` 插值）、整页星空 canvas、手写信两段式入场、类型星图节点（点击展开榜单）、失眠原因搜索、全站中英双语、静态 og:/canonical 分享卡片、收藏（书签 + 收藏页 + 与 APP 同格式导出/导入）、链接失效举报（⚠ 按钮 + ≥2 人置灰徽标 + Actions 自动巡检 + 站长后台三层判定）、数据页 /data（密钥门禁的画像/推荐/链接健康统计）、排行榜覆盖层 + 移动端返回手势、汉堡菜单。**云端三表 live**（community_picks / user_profiles / link_reports），`admin_verdict` 列待站主执行 v1.4 DDL 后生效；云端现有数据极少（个位数条目）。

**有意下线的东西（不要恢复）**：导航栏 导出/导入（社区数据以云端为唯一通道，顺带堵掉了绕过 AdGuard 的批量导入口子）；网站介绍按钮（注释保留）；emoji 图标（仅历史品牌位）。

## 3. 铁律（改代码前必读）

1. **改数据结构先改 `docs/DATA_CONTRACT.md` 并升版本号**，三处同步：网站 `index.html`、APP `RelaxStore.kt`、`adguard-rules.json`。网站域数据（收藏 `csc_favorites`、样例评分 `csc_sample_ratings`、`link_reports` 表）**有意不进契约**，别手痒合并。
2. **零依赖单文件**。不引入框架/npm 构建链/SDK；云端用原生 fetch 调 PostgREST。
3. **绝不引入广告、追踪器、Cookie 横幅**；新第三方静态资源也要先过问站主。
4. `CommunityPick.id` 是 epoch 毫秒 number（APP 端 Long）；排序规则（平均分→评分数→addedAt）两端一致。
5. 中文为主 UI；深浅主题跟时间走（`--t`），**不做手动亮暗开关**。
6. 改完必跑 §1.1 三件套；改行为必补断言；**动过 HTML 结构/视觉必须在真实浏览器截图验收**（桩看不出结构损伤与排版，血泪教训见 §7）。
7. 测试桩约定：测试用 `sed`/python 改过测试文件后，Edit 工具会报"file modified"——重新 Read 再 Edit。桩对 vm 沙盒的约定：顶层 `function`/`var` 声明会泄漏进沙盒全局（`sortPicks`、`refresh`、`deadReports` 可直接从测试触达），`const/let` 不会——需要测试注入的状态用 `var`（如 `deadReports`），其余用 `let/const`。
8. **/adm（站长后台）永不内嵌任何密钥**：service_role 只能运行时粘贴、仅存页面内存（刷新即丢）；页面公开可访问（robots Disallow + noindex、主站无入口链接），安全完全依赖密钥保密。数据渲染只许 textContent + http(s) 协议白名单（用户提交内容 = 不可信输入，防 XSS 偷内存里的密钥）；测试有红线扫描（JWT/sb_secret 字样、innerHTML、外链脚本），别"修复"掉。密钥本地持久化的唯一允许形态 = `.gitignore` 忽略的文件（如 `service_role.local.txt`），获取步骤见 §1.3。

## 4. 未来任务（按优先级）

0. **待站主执行（阻塞后台判定功能，页面已上线）**：Dashboard → SQL Editor 粘贴 `docs/supabase-schema.sql` 尾部「v1.4 站长后台」整段（幂等，可重复跑）。DDL 前后台可看可刷新，判活/判死会报「列不存在」（/adm 已内置引导提示）；主站 select=* 天然兼容，不受影响。
1. **APP 端云端同步（P1 收尾）**：`RelaxStore.kt` 是预留换源点，需写 `RemoteStore.kt`（HttpURLConnection 调同一 REST）+「社区云同步」开关。网站端已就绪。
2. **内容量冷启动**：站内真实条目仍是个位数，目标 30–50 条（收录眼光是站主的活，agent 可协助批量抓取/整理候选）。
3. **评论功能**：站主已拍板"要做但等有日活"。方案已备（见 §6 评论条目），落地即建 `comments` 表 + AdGuard 词表过滤 + 冷却 + 站主手动审核。
4. **语言标注**：决议=不分区、混排；等真实英文流量出现后做"标题 CJK 启发式标注 + 筛选 chip"（契约零改动方案已议）。
5. **APP 收藏增强**：见 `guangnaozhong/fossify-clock/收藏功能增强计划.md`（一键收藏/统一 urlKey/类型标签；网站→APP 收藏文件互通已通）。
6. **可选**：巡检脚本 `--prune` 自动删死链（需 SERVICE_ROLE secret，删除类操作保持人工触发）；自定义域名（顺带解决飞书/微信抓取 github.io 不稳的问题）。
7. **远期**：真实评分替换样例演示值（`sampleRatingAvg/Count` 是假数据，接真实聚合）；与 APP「寻找张怀民」联动留言墙。

## 5. APP 端速查（跨项目协作时）

- 代码：`R:\Code\MY project\guangnaozhong\fossify-clock`（独立 git 仓库，GitHub: Alidadei/MySleep）；构建与版本号见该仓库 `FORK_NOTES.md`
- 助眠相关：`helpers/RelaxStore.kt`（收藏+社区数据，"backend lands → swap point"）、`helpers/PicksRepository.kt`、`helpers/AdGuard.kt`、`helpers/InsomniaTypes.kt`、`helpers/LinkParser.kt`、`fragments/RelaxFragment.kt`（全部 UI）
- 有 Robolectric 测试：`./gradlew :app:testFossDebugUnitTest`，动 RelaxStore 前先跑通

## 6. 设计决策与取舍档案（不要"修复"它们）

> 按时间序。每条都是站主拍板或实战教训，推翻任何一条前先问站主。

- 打分后 ✓ 停留 1.5s 才刷新排序（让归位自然）；「APP 同款」徽章用内联 SVG 链条（审美规范规定 emoji 仅品牌位，现已连品牌位 emoji 也移除）；卡片整卡可点用标题锚点 `::after` 拉伸实现，评分/星星行靠 `z-index` 保持可点
- 配色：夜=藕荷紫 #B89BBF 系、昼=琥珀棕×雾杏粉系，`<head>` 时辰脚本按 5–8/17–20 点 smoothstep 连续插值（`--t`），页面久开每 10 分钟缓移；`?day=0/1` 调试；对比度昼间已核 ≥4.5:1。审美规范 §12.3 旧色板作废，别改回去
- B 站标题抓取走**开放 API + JSONP**（API 无 CORS 头，别改回 fetch）；其余站点直连读 `<title>`，CORS 拦截时静默回退域名标题（有意降级）；**永远不引第三方 CORS 代理**（隐私红线）
- 样例评分模拟：访客对样例打分存 `csc_sample_ratings`（≤50 条/条目），展示时并入演示聚合值；不进契约。收藏键 `csc_favorites` 存 `{key,title,url,type}` 对象数组（key=urlKey，旧字符串条目读取时自动迁移），**不进契约**
- 全屏手写信入场（Ma Shan Zheng 手写体 + sessionStorage 只播一次 + reduced-motion 跳过 + 硬上限；两段式：首次交互显示全文停住、二次交互才进站）；整页星空 canvas（分层静态离屏缓存，DPR 移动端 1.5 上限，白天跳帧）
- 品牌「电子安眠药」手写体；副标题=定位陈述「致失眠焦虑刷手机的你：这里是刷着刷着能让你睡着的地方」（副标题/meta description/og:description/README 四处同源，改一处同步四处）
- 分享卡片 og:/canonical **静态写在 head**（微信/QQ/Telegram/百度抓卡片不执行 JS，动态注入等于没有；测试红线禁止回归 JS 注入）。og:image=assets/og-cover.jpg（1200×630 基线 JPEG）。实测：微信贴链接永远纯文本（平台行为，卡片只在内置浏览器菜单分享时生成）；飞书抓得到标题但抓不动 github.io 图片（平台限制，无解，治本=自有域名）
- 收藏页 = `showRankingPage('favs')` 榜单页型态；同链接样例+社区并存时**社区条目优先去重**；池外收藏（APP 导入的站外内容）直接成卡；导出文件名/格式与 APP `RelaxDataIO` 完全一致（`sleep_station_favorites.json`，RelaxItem 数组，Gson 宽松兼容 → APP 导入零改动）
- 链接失效：浏览器 CORS 探测不了外链 → 社区举报制（`link_reports` 表，(pick_id,uid) 一人一票，insert-only RLS）；置灰报警为**双确认**（2026-09-17 站主定稿，缺一不可，起因=站主两台设备自测误触发）：机器人 `bot-linkcheck` 每日探测判死 **AND** ≥2 台设备人工举报（`DEAD_HUMAN_THRESHOLD=2`）→ 「⚠ 多人报告 + 机器验证：链接可能已失效」徽标；点 ⚠ 弹「反馈链接失效」确认浮窗（说明机制、确认才上报、成功自动关闭，`openDeadDialog`）；`tools/link-check.mjs` 每日 Actions 自动探测死链投 `bot-linkcheck` 一票（404/410/B站-404-403 才判死，反爬模糊态不判死）；表已建好并验证（2026-09-17）
- **站长后台 /adm（2026-09-19）**：报警升级为**三层规则**——站长判活（`admin_verdict='alive'`）永久压过机器人与一切举报、站长判死直接报警（无需双确认，徽标文案「⚠ 站长核实：链接已失效」）、无判定才走自动双确认；巡检机器人跳过已判定条目（人工裁决优先）。后台公开可访问但只读，管理操作需运行时粘贴 service_role（铁律见 §3.8）；anon 授权收缩为列级（update 仅 ratings/recommend_count，判定列 service_role 专属，见 schema v1.4）——这次收紧顺手堵了旧档案里「anon 可覆盖任意列」的已知限制。顶部常驻导航（数据页入口 + 返回主站）。**配色 = 暖白简化调色板**（站主指定采用 `/research-html` 色板：奶油底 #faf8f5 + 暖棕 #8d6e63，红 #b05050 仅危险语义），有意区别于主站深色星空，别"统一"回去
- **数据页 /data（2026-09-19）**：密钥门禁（同 /adm，service_role 运行时粘贴仅内存，进入前不渲染任何数据）；顶部常驻导航（站长后台入口 + 返回主站）；总览/用户画像/推荐内容/链接健康四区，进入后每 30 秒自动刷新；纯客户端聚合（三表全量拉取 limit 2000/5000，规模大后应改 PostgREST 聚合或视图）；画像标签映射与站内 `AGE_GROUP_KEYS/GENDER_KEYS/EDU_KEYS` 一致（未知值原样显示）；报警口径与主站三层规则同源（含 admin_verdict）；配色同 /adm 暖白简化；noindex + robots Disallow + 主站无入口
- 评论功能（未实现，方案冻结）：Supabase comments 表 + RLS（可读可插不可改删）+ AdGuard 词表 + uid 冷却 + 站长手动审核；不进契约；等有日活再上
- 导航 导出/导入 已下线（2026-09-17）：社区数据云端为唯一通道；附带堵住文件导入绕过 AdGuard 的口子

## 7. 开发经验与教训（每条都交过学费）

1. **验证金字塔**：`node --check` → DOM 桩 141 项 → headless 截图 → CDP 交互截图。桩的盲区=HTML 结构损伤与一切视觉问题；跳过最后一步交付过一次"样例全空"事故（§3.6）。
2. **分享卡片类功能必须静态写 head**——一切"运行时注入元数据"的方案对不执行 JS 的爬虫无效。
3. **存储结构升级别忘了写 key**：收藏从 urlKey 字符串升级为对象时，第一版漏存 `key` 字段，读回全被丢弃——schema 变更后立刻跑真实链路测试，别只看"没报错"。
4. **bash heredoc 反引号会吞字**：写含反引号/`$` 的内容用 `<<'EOF'`（带引号）或 python；`sed -i` 改文件后 Edit 工具会拒绝（文件状态过期），重新 Read 即可。
5. **多入口可能并行改仓库**：push 被拒（non-fast-forward）时 `git pull --rebase`，重复补丁会自动 drop；推送前先 fetch 看一眼。
6. **GitHub Pages 构建延迟 1–2 分钟**：验证线上用轮询（60s×N 次 curl grep），别在 40 秒时误判"没生效"。
7. **动作前探活**：本地预览服务器跨会话常被回收，curl 200 再用；IAB 内置浏览器 "webview not ready" 反复出现，直接切 headless Chrome/CDP，别耗在重试上。
8. **测试断言挂了先加诊断输出再猜**（ok() 的 extra 参数会打印），本仓多次"灵异失败"最后都是状态没进预期分支。
9. **外部服务的能力边界先查证再写方案**：GitHub Sponsors 大陆不可收款、飞书不渲染 github.io 预览图、浏览器探测不了跨域死活——都查证过，别在方案里复活这些死路。
10. **git push 到 github.com 失败按报错形态对号入座**：① `SSL_ERROR_SYSCALL` = HTTP/2 被干扰 → `git -c http.version=HTTP/1.1 push`（2026-09-17）；② `Failed to connect to 127.0.0.1 port 7890` = git 配置的代理没开，直连也会被墙（reset/timeout）——先 `netstat -an | grep LISTENING` 找实际代理端口（Clash Verge 新默认 7897，2026-09-19 实测），`git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=... push` 即过。另：`git push | tail` 吞退出码，重试循环必须判断 git 本身的退出码。
