# 承载能力测试记录（并发与月度配额）

> 测试日期：2026-09-21（北京时间）。执行：AI agent，站主委托「测一下网站能承受多少人同时用」。
> 本文档回答两个问题：**同一秒能有多少人**（瞬时并发）、**一个月能有多少次访问**（流量配额）。
> 复测脚本完整附在文末，结论过期时可直接重跑。

## 0. 结论（TL;DR）

1. **瞬时并发完全不是瓶颈**：实测 60 个访客同时打开完整网站、外加 100 个请求并发脉冲直打数据库接口，**全部成功、零失败、未触发限流**。同时几百人在用都在安全区。
2. **真正的天花板是 Supabase 免费档的每月下行流量（egress，约 5GB，以 Dashboard 显示为准）**，而不是"同时多少人"。
3. 当前云端数据极少（1 条），每次访问 API 流量 <1KB，月配额等于用不完；**但主站是全量拉取设计，条目涨到几百条后配额会开始可感知**。
4. **预警线：社区条目攒到 200–300 条时，把主站「全量拉取」改成「分页 + 精简 select」**（见 §4），做完流量降一个数量级，配额问题再度消失。在那之前不用动任何东西。

## 1. 被测架构与单访客请求画像

网站是两层结构，"承受能力"要分开算：

| 层 | 服务 | 访客每次打开主站会发生什么 |
|---|---|---|
| 静态层 | GitHub Pages（CDN 分发） | 下载 `index.html` ≈ **130KB**（132,617 字节，2026-09-21 实测） |
| 云端层 | Supabase 免费档（Singapore，前置 Cloudflare） | ① GET `community_picks?select=*&order=addedAt.desc&limit=1000`（全量榜单）② GET `link_reports?select=pick_id,uid&limit=5000`（举报表） |

写入类请求（推荐合并 / 打分 PATCH / 画像 upsert / 举报 insert）只在访客主动操作时发生，不在"打开页面"路径上；`/data` 数据页的 30 秒自动刷新被密钥门禁挡住，公众点不进去，烧不了配额。

关键参数实测（curl 直连，大陆网络，未挂代理）：

- 页面首开：HTTP 200，总耗时 1.26s，首字节 0.85s（大陆→GitHub Pages 的物理距离决定，与负载无关）。
- `community_picks`：冷连接 1.57s，热连接 0.31–0.43s；响应头 `x-envoy-upstream-service-time: 4` —— **数据库本身只花 4ms**；Cloudflare 命中香港边缘节点（cf-ray **HKG**）。
- 当时数据规模：`community_picks` 仅 **1 行**（content-range `0-0/1`），响应 243 字节；`link_reports` 148 字节。

## 2. 测试方法（以及为什么不"压到崩"）

**方法**：Node 24 内置 fetch 直连，模拟"一个访客打开网站"的完整动作——先拉页面，再按真实顺序拉榜单 + 举报表；从 1、10、30、60 人**同一秒**打开逐档加码，最后一记 100 并发脉冲只打榜单接口（最重的读路径）。全程只读，约 400 个请求，总量是"真实访客级别"。

**为什么不压到服务崩溃**：
- 免费档是共享服务，Supabase 前面是 Cloudflare——故意用压测工具往死里打，轻则触发限流，重则项目被判滥用封禁。收益（知道精确崩溃点）远小于风险（丢整个云端）。
- 真实用户是**分散陆续到来**的，不会挤在同一秒；同秒 60 人全流程 + 100 并发脉冲已经比真实场景苛刻。
- 实测结果已经足以回答"能承受多少人"：距离任何瓶颈都很远。

## 3. 实测结果

每档全部完成、失败数恒为 0，无 429/5xx：

| 场景 | 全部完成用时 | 页面 p50/p95 | 榜单 p50/p95 | 举报表 p50/p95 |
|---|---|---|---|---|
| 1 人打开 | 1385ms | 877 / – ms | 354 / – ms | 154 / – ms |
| 10 人同时 | 1590ms | 760 / 954 ms | 356 / 508 ms | 142 / 211 ms |
| 30 人同时 | 1478ms | 776 / 877 ms | 244 / 491 ms | 121 / 193 ms |
| 60 人同时 | 1255ms | 731 / 817 ms | 158 / 398 ms | 120 / 192 ms |
| **100 并发脉冲**（只打榜单） | **1105ms** | – | 428 / **1055ms**（max 1097） | – |

读法：
- 静态页延迟不随并发上涨（CDN 吸收），600–950ms 波动是网络抖动不是排队。
- 榜单接口在 60 并发下 p50 反而降到 158ms——连接池热身后更快；100 脉冲下 p95 ≈ 1.1s，依然全员成功。
- 首开 1 秒多的体感来自物理距离（新加坡/香港），人多人少都一样，**不是容量问题的信号**。

## 4. 两本账：瞬时并发 与 月度配额

### 4.1 瞬时并发（同时在线）

| 层 | 结论 |
|---|---|
| 静态层 | GitHub Pages 无公开的请求数硬上限，CDN 分发；本站规模下几千人同时开无压力。软上限：每月 100GB 带宽 ÷ 130KB/次 ≈ **80 万次全量首开/月**（浏览器有缓存，实际次数更高） |
| 云端层 | 实测 100 并发零失败、DB 查询 4ms；Postgres 简单 select 的保守承载是**每秒几百次**。免费档无公开的并发数硬限制，靠 Cloudflare + 公平使用兜底 |

**结论：瞬时并发对站点规模而言等于无限，不用担心。**

### 4.2 月度配额（这才要记账）

Supabase 免费档每月约 5GB 下行流量。主站每次打开 = 榜单 + 举报表全量拉取，流量随数据量线性涨：

| 阶段 | 每次访问 API 流量（估） | 5GB/月 ≈ 多少次访问 |
|---|---|---|
| 现在（个位数条目） | <1KB | 千万级，用不完 |
| 条目 ~200 条 | ~100KB | ~5 万次/月 |
| 条目 1000 条（拉取上限） | 0.5–1MB | **0.5–1 万次/月**，开始可感知 |

**触发式预案（做一次就够）**：条目到 200–300 条时——
1. `SupabaseStore.load()` 的 `limit=1000` 全量拉取改为分页/按需加载（类型节点展开时再拉该类）；
2. `select=*` 收窄为 `select=id,title,url,type,ratings,addedAt,recommend_count,admin_verdict`（`select=*` 是为 v1.4 DDL 未执行期的兼容兜底，DDL 落地后即可收窄）；
3. 两项合计流量降约一个数量级，配额天花板重新退回"用不完"。

改动落在 `index.html` 的 `SupabaseStore.load()`，动之前按惯例先跑 §1.1 三件套并补断言。

## 5. 复测方法

把文末脚本存为任意 `.mjs`（如 `C:/Users/lx/AppData/Local/Temp/load-test.mjs`），`node` 直接跑。零依赖（只用 Node 内置 fetch），只读不写，总请求约 400，规模安全。判读标准：

- 任一档出现非 2xx（尤其 429）或失败数 >0 → 到达当时承载边界，回来翻 §4 预案；
- 全绿但绝对延迟翻倍 → 先查本地网络，再查 Supabase Dashboard 是否降级/限流公告；
- 结论引用时注明当时的数据行数（流量账随数据量漂移，并发结论不漂移）。

## 附录：测试脚本（与 2026-09-21 实测所跑版本一致）

```js
/* 温和并发模拟：按真实访客行为（页面+榜单+举报表）分档测并发，最后 100 并发脉冲。
   总请求量 ~400，远低于滥用阈值；只读，不写任何数据。 */
const PAGE = 'https://alidadei.github.io/cyberSleepingPill/';
const SUPA = 'https://ttvaedbukdwpvdtmodeo.supabase.co/rest/v1';
const K = 'sb_publishable_buDoQC3OdWau8DdtUY9moQ_YbK5UgSm';
const H = { apikey: K, Authorization: 'Bearer ' + K };

const lat = { page: [], picks: [], reports: [] };
let errors = 0, total = 0;

async function timed(name, url, headers) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    await r.arrayBuffer();          /* 吃掉整个响应体才算完整下载 */
    total++;
    if (!r.ok) errors++;
    lat[name].push(Date.now() - t0);
  } catch (e) { total++; errors++; lat[name].push(Date.now() - t0); }
}

async function visitor() {
  /* 真实顺序：先开页面，再拉两张表 */
  await timed('page', PAGE + '?_=' + Date.now(), {});
  await timed('picks', SUPA + '/community_picks?select=*&order=addedAt.desc&limit=1000', H);
  await timed('reports', SUPA + '/link_reports?select=pick_id,uid&limit=5000', H);
}

function show(label, a) {
  if (!a.length) return;
  const s = [...a].sort((x, y) => x - y);
  const pct = p => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  const mean = Math.round(s.reduce((x, y) => x + y, 0) / s.length);
  console.log('  ' + label.padEnd(9) + ' p50=' + pct(0.5) + 'ms  p95=' + pct(0.95) + 'ms  max=' + s[s.length - 1] + 'ms  均值=' + mean + 'ms  n=' + s.length);
}

for (const n of [1, 10, 30, 60]) {
  console.log('\n== ' + n + ' 个访客同时打开 ==');
  const t0 = Date.now();
  await Promise.all(Array.from({ length: n }, () => visitor()));
  console.log('  全部完成用时 ' + (Date.now() - t0) + 'ms');
  show('页面', lat.page); show('榜单', lat.picks); show('举报表', lat.reports);
}

console.log('\n== 100 并发脉冲（只打榜单接口） ==');
const t0 = Date.now();
lat.picks = [];
await Promise.all(Array.from({ length: 100 }, () => timed('picks', SUPA + '/community_picks?select=*&order=addedAt.desc&limit=1000', H)));
console.log('  全部完成用时 ' + (Date.now() - t0) + 'ms');
show('榜单', lat.picks);

console.log('\n总计 ' + total + ' 个请求，失败/异常 ' + errors + ' 个');
```

脚本里内嵌的 anon key 是**公开凭据**（与 index.html 内嵌的同一个），不算密钥泄露。
