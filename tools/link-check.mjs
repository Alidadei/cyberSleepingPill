#!/usr/bin/env node
/* ================= 死链巡检（零依赖，Node 18+） =================
   用途：自动化处理「链接失效」——服务端环境没有 CORS 限制，可以直接探测外链死活。
   运行方式：
     node tools/link-check.mjs                # 全量探测，死链自动投「机器人一票」
     node tools/link-check.mjs --dry-run      # 只探测与输出，不写云端
     node tools/link-check.mjs --prune        # 额外：删除确认死链的条目（需 SERVICE_ROLE，慎用）
   设计配合网站端社区举报（docs/supabase-schema.sql 尾部 link_reports 表）：
     - 探测为死链 → 以 uid='bot-linkcheck' 向 link_reports 插一票（唯一约束防重复）
     - 网站端阈值 ≥2 个不同 uid → 卡片自动置灰 + 徽标（机器人 + 1 个真人即触发）
     - 复活的链接 → 若无真人举报，撤回机器人一票（需 SERVICE_ROLE，anon 模式跳过）
   判定规则：
     - B站视频  → 开放 API view?bvid= code:-404/-403(私密) 视为死链
     - YouTube  → oembed 404 视为死链（401=存在但禁外链，算活）
     - 其它站点 → GET 探测（取到响应头即止）：404/410 死链；403/429/5xx/超时 = 未知（反爬误判不放判）
   凭证：anon key 本就是公开的（内嵌在 index.html），环境变量缺省时用内置公开值；
     SUPABASE_SERVICE_ROLE 仅 --prune / 撤票需要（GitHub 仓库 Secrets 里配）。
   建议挂在 GitHub Actions 每日定时跑（.github/workflows/link-check.yml）。 */

const SUPA = (process.env.SUPABASE_URL || 'https://ttvaedbukdwpvdtmodeo.supabase.co').replace(/\/+$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_buDoQC3OdWau8DdtUY9moQ_YbK5UgSm';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE || '';
const DRY = process.argv.includes('--dry-run');
const PRUNE = process.argv.includes('--prune');
const BOT_UID = 'bot-linkcheck';
const TIMEOUT = 12000;
const CONCURRENCY = 4;

const hdr = key => ({ apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' });
const rest = path => `${SUPA}/rest/v1/${path}`;
async function jfetch(path, opts = {}, key = ANON) {
  const r = await fetch(rest(path), { ...opts, headers: { ...hdr(key), ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`${opts.method || 'GET'} ${path.split('?')[0]} -> ${r.status}`);
  if (r.status === 204) return null;
  return r.json();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- 探测器 ---- */
async function probeBilibili(url) {
  const m = url.match(/video\/(BV\w+|av\d+)/i);
  if (!m) return { s: 'unknown', why: '非视频直链' };
  const idKey = /^av/i.test(m[1]) ? 'aid=' + m[1].slice(2) : 'bvid=' + m[1];
  const r = await fetch(`https://api.bilibili.com/x/web-interface/view?${idKey}`,
    { headers: { 'User-Agent': 'Mozilla/5.0 cyberSleepLinkCheck/1.0' }, signal: AbortSignal.timeout(TIMEOUT) });
  const j = await r.json();
  if (j.code === 0) return { s: 'alive' };
  if (j.code === -404 || j.code === -403) return { s: 'dead', why: `B站 API code=${j.code}` };
  return { s: 'unknown', why: `B站 API code=${j.code}` };
}
async function probeYouTube(url) {
  const m = url.match(/(?:watch\?v=|youtu\.be\/|shorts\/)([\w-]{6,})/);
  if (!m) return { s: 'unknown', why: '非视频直链' };
  const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + m[1])}&format=json`,
    { signal: AbortSignal.timeout(TIMEOUT) });
  if (r.status === 200 || r.status === 401) return { s: 'alive' };
  if (r.status === 404) return { s: 'dead', why: 'oembed 404' };
  return { s: 'unknown', why: 'oembed ' + r.status };
}
async function probeGeneric(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) cyberSleepLinkCheck/1.0' },
    redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT)
  });
  if (r.body) r.body.cancel().catch(() => { });   /* 取到响应头即判定，不下载正文 */
  if (r.status < 400) return { s: 'alive' };
  if (r.status === 404 || r.status === 410) return { s: 'dead', why: 'HTTP ' + r.status };
  return { s: 'unknown', why: 'HTTP ' + r.status };
}
async function probe(url) {
  try {
    if (/bilibili\.com/i.test(url)) return await probeBilibili(url);
    if (/youtube\.com|youtu\.be/i.test(url)) return await probeYouTube(url);
    return await probeGeneric(url);
  } catch (e) {
    return { s: 'unknown', why: e.name === 'TimeoutError' ? '超时' : '网络错误' };
  }
}

/* ---- 主流程 ---- */
/* select=*：兼容 admin_verdict 列存在与否（站长后台人工判定的条目跳过自动投票） */
const picks = await jfetch('community_picks?select=*&limit=1000');
if (!Array.isArray(picks)) throw new Error('picks 加载失败');
const decided = picks.filter(p => p.admin_verdict);          /* 站长已判活/判死 → 人工裁决优先，不投机器人票 */
const pending = picks.filter(p => !p.admin_verdict);
if (decided.length) console.log(`站长已人工判定 ${decided.length} 条（跳过自动探测）：` + decided.map(p => `#${p.id}`).join(' '));
console.log(`共 ${pending.length} 条云端推荐待检`);

/* link_reports 表未创建（404）时按「无举报」降级，只做探测 */
async function safeList(path) {
  try { return await jfetch(path); } catch (e) { if (/404/.test(e.message)) return []; throw e; }
}
const botVotes = new Set((await safeList(`link_reports?select=pick_id&uid=eq.${BOT_UID}&limit=5000`)).map(r => String(r.pick_id)));
const humans = await safeList('link_reports?select=pick_id,uid&limit=5000');
const humanCount = {};
for (const r of humans) if (r.uid !== BOT_UID) humanCount[r.pick_id] = (humanCount[r.pick_id] || 0) + 1;

const results = [];
for (let i = 0; i < pending.length; i += CONCURRENCY) {
  const wave = pending.slice(i, i + CONCURRENCY).map(async p => {
    const r = await probe(p.url);
    results.push({ ...p, ...r });
  });
  await Promise.all(wave);
  if (i + CONCURRENCY < picks.length) await sleep(300);   /* 温柔一点，别触发平台风控 */
}

const dead = results.filter(r => r.s === 'dead');
const unknown = results.filter(r => r.s === 'unknown');
console.log('\n---- 探测汇总 ----');
console.log(`存活 ${results.length - dead.length - unknown.length} | 死链 ${dead.length} | 未知(反爬/超时，不判死) ${unknown.length}`);
for (const r of dead) console.log(`  [死链] #${r.id} ${r.title}  ${r.url}  (${r.why})`);
for (const r of unknown) console.log(`  [未知] #${r.id} ${r.title}  ${r.url}  (${r.why})`);

const top = Object.entries(humanCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
if (top.length) {
  console.log('\n---- 人工举报排行 TOP10 ----');
  for (const [pid, n] of top) {
    const p = picks.find(x => String(x.id) === String(pid));
    console.log(`  ${n} 票  #${pid} ${p ? p.title : '(已删除)'}`);
  }
}

if (DRY) { console.log('\n[dry-run] 不写云端，结束'); process.exit(0); }

let wrote = 0, revoked = 0;
for (const r of dead) {
  if (botVotes.has(String(r.id))) continue;
  try {
    await jfetch('link_reports', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ pick_id: String(r.id), uid: BOT_UID, created_at: new Date().toISOString() })
    });
    wrote++;
  } catch (e) { console.log(`  投票失败 #${r.id}: ${e.message}`); }
  await sleep(150);
}
if (SERVICE) {
  for (const r of results.filter(x => x.s === 'alive' && botVotes.has(String(x.id)) && !(humanCount[x.id] > 0))) {
    try {
      await jfetch(`link_reports?pick_id=eq.${r.id}&uid=eq.${BOT_UID}`, { method: 'DELETE' }, SERVICE);
      revoked++;
    } catch (e) { /* 撤票失败不影响主流程 */ }
  }
} else if (botVotes.size) {
  console.log('\n[提示] 配置 SUPABASE_SERVICE_ROLE 后可自动撤回复活链接的机器人票');
}

if (PRUNE) {
  if (!SERVICE) console.log('\n[prune] 需要 SUPABASE_SERVICE_ROLE，跳过删除');
  else {
    for (const r of dead) {
      if (!botVotes.has(String(r.id)) && !(humanCount[r.id] >= 2)) continue;   /* 只删机器人确认 或 人工≥2票 的 */
      try {
        await jfetch(`link_reports?pick_id=eq.${r.id}`, { method: 'DELETE' }, SERVICE);
        await jfetch(`community_picks?id=eq.${r.id}`, { method: 'DELETE' }, SERVICE);
        console.log(`  [已删除] #${r.id} ${r.title}`);
      } catch (e) { console.log(`  删除失败 #${r.id}: ${e.message}`); }
      await sleep(150);
    }
  }
}
console.log(`\n完成：机器人新投票 ${wrote}，撤票 ${revoked}`);
