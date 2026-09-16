/* cyberSleepCommunity index.html 行为测试：Node + 最小 DOM 桩，无外部依赖。
 * 运行：node tests/dom-test.mjs
 * 覆盖：类型星图节点（默认收起、点选展开、无类型、自定义标签节点）/
 *       B站分享文本拆解 + 标题抓取 / 发布 / URL 去重 / AdGuard / 星星评分（真实+样例模拟）/
 *       ESC / 入场动画两段式 / 导入合并去重 / APP 同款徽章 / 排序契约 / 中英切换 / 红线扫描 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/* HTML 结构冒烟：关键 id 必须在标记里恰好出现一次（防解析层删改——桩按 id 注册，看不出结构缺失）。
   navAbout 已注释隐藏（保留 id 字符串即视为结构完整，恢复取消注释即可） */
for (const id of ['list','loadMsg','brandTitle','subtitle','navLang','formTitle','labelTitle','labelUrl','labelType','formHint','letterCaption','sisterApp','sisterName','introHint','navAbout','typeList','tagNodes','searchBox','fTitle','fUrl','fType','fSubmit','fMsg','ioMsg','navPublish','navFavs','favFileImport','formPanel','intro','introText','introSign','skyStars','letterBox','navLetter','hamburgerBtn','mainNav','rankingOverlay']) {
  const n = (html.match(new RegExp('id="' + id + '"', 'g')) || []).length;
  if (n !== 1) throw new Error('HTML 结构错误: id="' + id + '" 出现 ' + n + ' 次（应为 1 次）');
}

const scripts = html.match(/<script>[\s\S]*?<\/script>/g)
  .map(s => s.replace(/<\/?script>/g, ''));
if (!scripts.length) throw new Error('script not found');
const script = scripts.join('\n')
  /* 中和云端配置：测试永远走 LocalStore，不随 index.html 里填写的 SUPABASE 值联网 */
  .replace(/const SUPABASE = \{[^}]*\};/, "const SUPABASE = { url: '', anonKey: '' };");

/* 分享卡片红线：og/canonical 必须静态写在 <head>——微信/QQ/Telegram/百度抓分享卡片不执行 JS。
   域名与 robots.txt / sitemap.xml 三处一致，换域名时同步改 */
const CANON = 'https://alidadei.github.io/cyberSleepingPill/';
if (!html.includes('<link rel="canonical" href="' + CANON + '">')) throw new Error('静态 canonical 缺失');
if (!html.includes('<meta property="og:image" content="' + CANON + 'assets/og-cover.jpg">')) throw new Error('静态 og:image 缺失');
if (!html.includes('<meta property="og:title" content="电子安眠药 · 犯困内容打分网站">')) throw new Error('静态 og:title 缺失');
if (!html.includes('<meta name="twitter:card" content="summary_large_image">')) throw new Error('twitter:card 缺失');
if (/injectSiteMeta|const SITE =/.test(script)) throw new Error('禁止 JS 注入 og/canonical（分享爬虫不执行 JS）');
/* 层级红线：发布面板 z-index 必须高于排行覆盖层（25），否则榜单页内表单不可见 →「提交跳回主页」反复发 */
if (!/\.panel \{[\s\S]*?z-index:\s*26/.test(html)) throw new Error('面板层级 ≤ 榜单覆盖层');
const hbNone = html.search(/\.hamburger \{[\r\n]+ *display: none/);
if (hbNone < 0) throw new Error('汉堡基规则缺失');
if (html.slice(hbNone).search(/\.hamburger \{[\r\n]+ *display: block/) < 0) throw new Error('汉堡显隐层叠顺序错误（display:block 必须位于 display:none 之后）');

/* 红线：不得出现 prompt()/alert()/confirm() */
for (const banned of ['prompt(', 'alert(', 'confirm(']) {
  if (script.includes(banned)) throw new Error('red line violated: ' + banned);
}

/* ---------- 最小 DOM 桩 ---------- */
class ClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
  _sync() { this.el.attrs['class'] = [...this.set].join(' '); }
  add(...cs) { cs.forEach(c => this.set.add(c)); this._sync(); }
  remove(...cs) { cs.forEach(c => this.set.delete(c)); this._sync(); }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : force;
    on ? this.set.add(c) : this.set.delete(c); this._sync(); return on;
  }
  contains(c) { return this.set.has(c); }
}
function makeCtx() {
  const noop = () => {};
  return {
    scale: noop, setTransform: noop, drawImage: noop, fillRect: noop, beginPath: noop,
    arc: noop, fill: noop, moveTo: noop, lineTo: noop, stroke: noop, save: noop,
    restore: noop, translate: noop, rotate: noop, clearRect: noop,
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop })
  };
}
let allNodes = [];
class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = []; this.parentNode = null;
    this.attrs = {}; this.style = {}; this._handlers = {};
    this.classList = new ClassList(this);
    this.value = ''; this.disabled = false; this.target = ''; this.rel = ''; this.href = '';
    this.type = ''; this.files = []; this._removed = false;
    allNodes.push(this);
  }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = v; }
  get className() { return this.attrs['class'] || ''; }
  set className(v) { this.attrs['class'] = v; this.classList.set = new Set(v.split(/\s+/).filter(Boolean)); }
  get textContent() {
    return this.children.map(c => typeof c === 'string' ? c : c.textContent).join('');
  }
  set textContent(v) { this.children = [String(v)]; }
  get innerHTML() { return ''; }
  set innerHTML(v) { if (v === '') this.children = []; else throw new Error('innerHTML only supports clearing'); }
  appendChild(n) {
    if (n.parentNode) n.parentNode.removeChild(n);
    n.parentNode = this; this.children.push(n); return n;
  }
  removeChild(n) {
    const i = this.children.indexOf(n);
    if (i >= 0) { this.children.splice(i, 1); n.parentNode = null; }
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); this._removed = true; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(ev, fn) { (this._handlers[ev] ||= []).push(fn); }
  removeEventListener(ev, fn) { if (this._handlers[ev]) this._handlers[ev] = this._handlers[ev].filter(f => f !== fn); }
  dispatch(ev) { (this._handlers[ev] || []).forEach(fn => fn({ target: this })); }
  _match(token) {
    const t = token.match(/^([a-z]*)((?:\.[\w-]+)*)(?:\[([\w-]+)="([^"]*)"\])?$/i);
    if (!t) throw new Error('bad selector token: ' + token);
    const [, tag, classes, attr, val] = t;
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    for (const c of classes.split('.').filter(Boolean)) if (!this.classList.contains(c)) return false;
    if (attr && this.attrs[attr] !== val) return false;
    return true;
  }
  querySelectorAll(sel) {
    const out = [];
    for (const part of sel.split(',')) {
      for (const r of this._query(part.trim())) if (!out.includes(r)) out.push(r);
    }
    return out;
  }
  _query(sel) {
    const tokens = sel.trim().split(/\s+/);
    if (!tokens[0]) return [];
    const out = [];
    const walk = (node, i) => {
      for (const c of node.children) {
        if (c && typeof c === 'object' && c._match) {
          if (c._match(tokens[i])) { i + 1 === tokens.length ? out.push(c) : walk(c, i + 1); }
          else walk(c, i);
        }
      }
    };
    walk(this, 0);
    return out;
  }
  getBoundingClientRect() { return { x: 0, y: 0, width: 100, height: 20 }; }
  getContext() { return makeCtx(); }
  click() { if (this.onclick) this.onclick(); }
}
function makeEl(tag) { return new El(tag); }

const registry = {};
for (const id of ['list','loadMsg','brandTitle','subtitle','navLang','formTitle','labelTitle','labelUrl','labelType','formHint','letterCaption','sisterApp','sisterName','introHint','navAbout','typeList','tagNodes','searchBox','fTitle','fUrl','fType','fSubmit','fMsg','ioMsg','navPublish','navFavs','favFileImport','formPanel','intro','introText','introSign','skyStars','letterBox','navLetter','hamburgerBtn','mainNav','rankingOverlay']) {
  registry[id] = makeEl(id === 'fTitle' || id === 'fUrl' || id === 'fType' || id === 'searchBox' ? 'input' : 'div');
  registry[id].id = id;
}
registry.searchBox.className = 'search';

let docHandlers = {};
const cssVars = {};
const documentElement = { style: { setProperty(k, v) { cssVars[k] = v; } }, lang: '' };
const bodyKids = [];
const document = {
  documentElement,
  body: { style: {}, appendChild: n => bodyKids.push(n) },
  createElement: makeEl,
  createElementNS: (ns, tag) => makeEl(tag),
  createTextNode: t => ({ TEXT: true, textContent: String(t) }),
  getElementById: id => (registry[id] && !registry[id]._removed) ? registry[id] : null,
  querySelectorAll: sel => registry.list.querySelectorAll(sel).concat(
    registry.rankingOverlay.querySelectorAll(sel)).concat(
    sel.includes('.rate') ? allNodes.filter(n => n._match('.rate[aria-expanded="true"]')) : []),
  addEventListener: (ev, fn) => { (docHandlers[ev] ||= []).push(fn); },
  removeEventListener: (ev, fn) => { if (docHandlers[ev]) docHandlers[ev] = docHandlers[ev].filter(f => f !== fn); },
  title: '',
};

const storage = new Map();
const localStorage = {
  getItem: k => storage.has(k) ? storage.get(k) : null,
  setItem: (k, v) => storage.set(k, String(v)),
};
/* 预置「已看过入场动画」：默认路径跳过打字（打字/两段式另行断言） */
const sessionStore = new Map([['csc_intro_done', '1']]);
const sessionStorage = {
  getItem: k => sessionStore.has(k) ? sessionStore.get(k) : null,
  setItem: (k, v) => sessionStore.set(k, String(v)),
};

class FileReader {
  readAsText(f) { this.result = f.content; setImmediate(() => this.onload()); }
}
class Blob { constructor(parts) { this.parts = parts; } }

const sandbox = {
  document, localStorage, sessionStorage, FileReader, Blob,
  URL: Object.assign(URL, { createObjectURL: b => { globalThis.__lastBlob = b; return 'blob:x'; } }),
  fetch: () => Promise.reject(new Error('offline in tests')),
  AbortController,
  setInterval: () => 0,   /* 测试不真的轮询，也避免计时器挂住进程 */
  requestAnimationFrame: () => 0,
  matchMedia: () => ({ matches: false }),
  location: { search: '' },
  innerWidth: 900, innerHeight: 700, devicePixelRatio: 1,
  addEventListener: () => {}, removeEventListener: () => {},
  console, setTimeout, clearTimeout, Math, Date, JSON, Set, Object, Array, Number, String, RegExp, Promise,
  history: { state: null, pushState: function (s) { this.state = s; }, back: function () { this.state = null; } }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
new vm.Script(script).runInContext(sandbox);
const { sortPicks, playIntro, urlKey } = sandbox;

const cards = () => registry.rankingOverlay.querySelectorAll('.card');
const g = id => registry[id];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0;
function ok(cond, name, extra) {
  if (!cond) throw new Error('FAIL: ' + name + (extra !== undefined ? ' | ' + JSON.stringify(extra) : ''));
  pass++; console.log('  ✓ ' + name);
}
const store = () => JSON.parse(storage.get('csc_community_picks') || '[]');
const sampleStore = () => JSON.parse(storage.get('csc_sample_ratings') || '{}');
const liveNodes = () => registry.tagNodes.querySelectorAll('.node');
const clickNode = label => liveNodes().find(n => n.children[1].textContent === label).onclick();
const ensureNode = label => { const n = liveNodes().find(x => x.children[1].textContent === label); n.onclick(); };
const cardTitle = c => c.children[0].children[1].textContent;

/* ---------- 1. 初始化：默认收起 + 节点星图 + 主题 ---------- */
await sleep(20);
ok(g('brandTitle').textContent === '电子安眠药', '品牌名默认中文（电子安眠药）', g('brandTitle').textContent);
ok(registry.typeList.children.length === 4, '类型建议列表（datalist）4 项');
ok(cards().length === 0, '默认榜单收起（未点亮节点）', cards().length);
ok(!registry.list.textContent.includes('点亮一颗星'), '首页不再显示点亮指引');
ok(liveNodes().length === 6, '节点 = 全部 + 4 内置类型 + 无类型', liveNodes().length);
ok(registry.tagNodes.querySelectorAll('input.search').length === 1, '搜索框挂回星图容器（绝对居中于光点之间）');
ok(registry.tagNodes.querySelectorAll('input.search')[0].id === 'searchBox', '星图内搜索框就是 #searchBox');
ok(liveNodes().every(n => {
  const l = parseFloat(n.style.left), t = parseFloat(n.style.top);
  return Math.abs(l - 50) >= 27 || Math.abs(t - 50) >= 15;
}), '光点不侵入搜索框中央禁区（环绕而非覆盖文字）', liveNodes().map(n => n.style.left + ',' + n.style.top).join(' '));
ok(/^#[0-9a-f]{6}$/i.test(cssVars['--bg'] || ''), '时辰主题脚本已写入 --bg（夜/昼插值）', cssVars['--bg']);
ok(cssVars['--t'] !== undefined && !Number.isNaN(parseFloat(cssVars['--t'])), '昼夜渐变因子 --t 已就绪', cssVars['--t']);
ok(cssVars['--accent-rgb'] && cssVars['--accent-rgb'].split(',').length === 3, 'accent RGB 三元组供透明度派生', cssVars['--accent-rgb']);

/* ---------- 2. 点节点展开 + B站分享文本拆解 + 发布 ---------- */
clickNode('噪音干扰型');
ok(registry.rankingOverlay.classList.contains('open'), '点击节点打开排行榜覆盖层');
ok(cards().length === 1 && cardTitle(cards()[0]).includes('雨声助眠 8 小时'), '点「噪音干扰型」展开样例卡', cards().length);
ok(cards()[0].children[1].textContent.includes('★ 4.9 · 302 次评价'), '样例卡渲染示例评分', cards()[0].children[1].textContent);
ok(cards()[0].querySelectorAll('.type')[0].textContent === '# 噪音干扰型', '类型标签 # 前缀无框样式');

g('fTitle').value = '';
g('fUrl').value = '【深海鲸鱼白噪音 · 循环三小时】 https://www.bilibili.com/video/BV1xx411c7mD?share_source=copy_web';
g('fUrl').dispatch('input');
ok(g('fTitle').value === '深海鲸鱼白噪音 · 循环三小时', '分享文本自动拆出标题', g('fTitle').value);
ok(g('fUrl').value === 'https://www.bilibili.com/video/BV1xx411c7mD?share_source=copy_web', '分享文本自动拆出链接');
const submitResult = await g('fSubmit').onclick().then(() => 'resolved').catch(e => 'THREW: ' + e.message);
ok(submitResult === 'resolved' && g('fMsg').classList.contains('ok'), '发布成功反馈 ok 态', g('fMsg').textContent);
ok(store().length === 1, '数据入库（契约字段）', store());

/* ---------- 3. 同 URL 合并语义（社区重复 → recommendCount+1；内置精选不可合并） ---------- */
g('fTitle').value = '换个标题再发一次';
g('fUrl').value = 'https://www.bilibili.com/video/BV1xx411c7mD?share_source=copy_web';
await g('fSubmit').onclick();
ok(g('fMsg').classList.contains('ok') && g('fMsg').textContent.includes('推荐次数 +1'), '同链接合并次数+1', g('fMsg').textContent);
ok(store().length === 1 && store()[0].recommendCount === 2, '不重复入库，次数递增', store()[0].recommendCount);
g('fTitle').value = '';
g('fUrl').value = 'http://m.bilibili.com/search/?keyword=%E9%9B%A8%E5%A3%B0%E5%8A%A9%E7%9C%A08%E5%B0%8F%E6%97%B6';
await g('fSubmit').onclick();
ok(g('fMsg').classList.contains('bad') && g('fMsg').textContent.includes('与内置精选'), '与内置精选同链仍拦截（无法合并）', g('fMsg').textContent);

/* ---------- 4. AdGuard 拦截 ---------- */
g('fTitle').value = '兼职刷单加微信 abc12345';
g('fUrl').value = 'https://example.com/ads';
await g('fSubmit').onclick();
ok(g('fMsg').classList.contains('bad') && g('fMsg').textContent.startsWith('未发布：'), 'AdGuard 拦截广告内容', g('fMsg').textContent);
ok(store().length === 1, '被拦截内容不入库');

/* ---------- 5. 无类型节点 + 星星评分（社区卡） ---------- */
clickNode('无类型');
await sleep(10);
ok(cards().length === 1 && cardTitle(cards()[0]).includes('深海鲸鱼'), '「无类型」节点收录未分类推荐', cards().length);
const whaleCard = cards()[0];
ok(whaleCard.children[1].textContent.includes('bilibili.com'), '暂无评分时显示来源域名', whaleCard.children[1].textContent);
ok(whaleCard.children[1].textContent.includes('被推荐 2 次'), '合并后卡片显示推荐次数', whaleCard.children[1].textContent);
const rateBtn = whaleCard.querySelectorAll('.rate')[0];
ok(rateBtn.getAttribute('aria-expanded') === 'false', '评分按钮初始收起');
rateBtn.onclick();
const starsRow = whaleCard.children[2];
ok(starsRow.classList.contains('open'), '点评分按钮展开星星行');
ok(starsRow.querySelectorAll('.star').length === 5, '五颗星');
const star4 = starsRow.querySelectorAll('.star')[3];
star4.onmouseenter();
ok(starsRow.querySelectorAll('.star').filter(s => s.classList.contains('on')).length === 4, 'hover 第 4 颗预览点亮 4 颗');
starsRow.onmouseleave();
ok(starsRow.querySelectorAll('.star').every(s => !s.classList.contains('on')), '移出后预览清空');
await star4.onclick();
ok(starsRow.textContent.includes('已评分 ✓'), '评分后行内 ✓ 反馈', starsRow.textContent);
await sleep(1600);
ok(store()[0].ratings.join() === '4', '评分入库 ratings=[4]', store()[0].ratings);
const whaleCard2 = cards().find(c => cardTitle(c).includes('深海鲸鱼'));
ok(whaleCard2.children[1].textContent.includes('★ 4.0 · 1 次评价'), '刷新后 meta 显示聚合分', whaleCard2.children[1].textContent);
ok(whaleCard2.children[1].textContent.includes('被推荐 2 次'), '刷新后 meta 仍显示推荐次数');
ok(whaleCard2.querySelectorAll('.rate')[0].getAttribute('aria-expanded') === 'false', '✓ 1.5s 后列表重渲染、入口复位');

/* ---------- 6. ESC 关闭星星行 ---------- */
whaleCard2.querySelectorAll('.rate')[0].onclick();
const row2 = whaleCard2.children[2];
ok(row2.classList.contains('open'), '再次展开');
docHandlers.keydown.forEach(fn => fn({ key: 'Escape' }));
ok(!row2.classList.contains('open'), 'ESC 关闭星星行');

/* ---------- 7. 自定义类型标签（可添加） ---------- */
g('fTitle').value = '篝火白噪音';
g('fUrl').value = 'https://example.com/campfire';
g('fType').value = '白噪音';
await g('fSubmit').onclick();
ok(g('fMsg').classList.contains('ok'), '自定义标签发布成功');
ok(liveNodes().some(n => n.children[1].textContent === '白噪音'), '自定义标签自动生成节点');
clickNode('白噪音');
ok(cards().length === 1 && cardTitle(cards()[0]).includes('篝火白噪音'), '自定义节点可筛选', cards().length);
ok(cards()[0].children[1].textContent.includes('# 白噪音'), '卡片标签以 # 前缀展示');
ok(cards()[0].children[1].textContent.includes('被推荐 1 次'), '单次推荐卡片也显示推荐次数（1 次）', cards()[0].children[1].textContent);
clickNode('白噪音');   /* 收起 */

/* ---------- 8. 样例评分模拟（并入示例聚合值） ---------- */
clickNode('噪音干扰型');
const noiseSampleCardUrl = cards()[0].children[0].children[1].href;   /* 噪音样例链接 */
const noiseSampleCard = cards().find(c => cardTitle(c).includes('雨声助眠 8 小时'));
noiseSampleCard.querySelectorAll('.rate')[0].onclick();
const srow = noiseSampleCard.children[2];
await srow.querySelectorAll('.star')[4].onclick();   /* 给 5 星 */
ok(sampleStore()[urlKey(noiseSampleCardUrl)].join() === '5', '样例评分存独立本地键（不污染契约数据）');
await sleep(1600);
const noiseMeta = cards().find(c => cardTitle(c).includes('雨声助眠 8 小时')).children[1].textContent;
ok(noiseMeta.includes('★ 4.9 · 303 次评价'), '样例评分并入示例聚合值（302→303 次）', noiseMeta);

/* ---------- 9. 发布面板 ---------- */
g('navPublish').onclick();
ok(g('formPanel').classList.contains('open'), '导航「推荐药方」展开面板');
g('navPublish').onclick();
ok(!g('formPanel').classList.contains('open'), '再点收起面板');
g('navPublish').onclick();
docHandlers.keydown.forEach(fn => fn({ key: 'Escape' }));
ok(!g('formPanel').classList.contains('open'), 'ESC 关闭面板');
ok(g('formTitle').textContent === '推荐任意让你犯困的小说、视频、播客…', '表单标题文案', g('formTitle').textContent);
ok(g('fSubmit').textContent === '提交推荐', '提交按钮文案', g('fSubmit').textContent);

/* ---------- 9b. 排行榜页内导航可用 + 汉堡菜单点选收起 ---------- */
clickNode('噪音干扰型');
ok(g('rankingOverlay').classList.contains('open'), '排行榜页已打开（前置）');
const rankBadge = g('rankingOverlay').querySelectorAll('.ranking-type-badge')[0];
ok(rankBadge.textContent === '# 噪音干扰型', '类型标签（# 噪音干扰型，居中大两号）');
const rankSearchBtn = g('rankingOverlay').querySelectorAll('.ranking-search-btn')[0];
ok(!!rankSearchBtn && rankSearchBtn.children.some(c => c.tagName === 'SVG'), '放大镜小图标挨在标签右边');
const rankSearchLine = () => registry.rankingOverlay.querySelectorAll('.ranking-search-line')[0];
ok(!rankSearchLine().classList.contains('show'), '搜索框默认隐去（不占空间）');
rankSearchBtn.onclick();
ok(rankSearchLine().classList.contains('show'), '点放大镜向右展开一条线');
rankSearchBtn.onclick();
ok(!rankSearchLine().classList.contains('show'), '再点放大镜收起搜索线');
g('navPublish').onclick();
ok(g('rankingOverlay').classList.contains('open'), '排行榜页中点「推荐药方」榜单保留');
ok(g('formPanel').classList.contains('open'), '并展开发布面板');
g('navPublish').onclick();
clickNode('噪音干扰型');
g('hamburgerBtn').onclick();
ok(g('mainNav').classList.contains('open'), '汉堡打开移动端菜单');
g('navPublish').onclick();
ok(!g('mainNav').classList.contains('open'), '菜单内点「推荐药方」自动收起菜单');
ok(g('formPanel').classList.contains('open'), '且发布面板展开可见');
g('navPublish').onclick();
clickNode('噪音干扰型');
docHandlers.keydown.forEach(fn => fn({ key: 'Escape' }));
ok(!g('rankingOverlay').classList.contains('open') && !g('formPanel').classList.contains('open'), 'ESC 一并收起榜单/面板');

/* ---------- 10. APP 同款徽章（社区数据与内置精选同链接）----------
   原走文件导入路径播种，2026-09-17 导航 导出/导入 入口下线后改为直写本机库 + refresh() */
storage.set('csc_community_picks', JSON.stringify([...store(), {
  id: 1720000000001, title: '雨声（与内置精选同款）',
  url: 'https://m.bilibili.com/search?keyword=%E9%9B%A8%E5%A3%B0%E5%8A%A9%E7%9C%A08%E5%B0%8F%E6%97%B6',
  type: 'noise', ratings: [4, 5], addedAt: 1720000000001, recommendCount: 1
}]));
await sandbox.refresh();
ensureNode('噪音干扰型');
const twinCard = cards().find(c => cardTitle(c).includes('雨声（与内置精选同款）'));
ok(!!twinCard && twinCard.querySelectorAll('.twin').length === 1, '同款内容显示「APP 同款」徽章');
ok(twinCard && twinCard.querySelectorAll('.twin')[0].textContent === 'APP 同款', '徽章文案');

/* ---------- 11. 排序契约（噪音型内 + 纯函数） ---------- */
ensureNode('噪音干扰型');
const noiseTitles = cards().map(cardTitle);
ok(JSON.stringify(noiseTitles) === JSON.stringify([
  '【样例】雨声助眠 8 小时 · 雨打窗台',
  '雨声（与内置精选同款）']), '同类型内按平均分降序（样例与真实内容同榜）', noiseTitles);
ok(sortPicks([
  { title:'a', ratings:[4], addedAt:1 },
  { title:'b', ratings:[5], addedAt:2 },
  { title:'c', ratings:[4], addedAt:3 }
]).map(p => p.title).join(',') === 'b,c,a', 'sortPicks 纯函数：平均分→评分数→时间');

/* ---------- 12. 中英双语切换 ---------- */
g('navLang').onclick();
ok(g('navPublish').textContent === 'Prescribe' && g('brandTitle').textContent === 'Cyber Sleeping Pills', '切换 EN：导航与品牌变英文', g('brandTitle').textContent);
ok(liveNodes().some(n => n.children[1].textContent === 'Anxiety'), 'EN 下节点标签变英文');
ok(cards().length === 2 && cards().every(c => c.children[1].textContent.includes('# Noise')), 'EN 下类型标签 # Noise（噪音型 2 张卡）', cards().length);
g('navLang').onclick();
ok(g('navPublish').textContent === '推荐药方' && g('brandTitle').textContent === '电子安眠药', '切回中文：推荐药方 / 电子安眠药');

/* ---------- 12b. 收藏（书签 + 收藏榜单页） ---------- */
clickNode('噪音干扰型');
const favBtn0 = cards()[0].children[0].children[3];
ok(favBtn0.getAttribute('aria-label') === '收藏这条', '卡片带书签按钮（未收藏态）');
favBtn0.onclick();
ok(favBtn0.getAttribute('aria-pressed') === 'true' && JSON.parse(localStorage.getItem('csc_favorites')).length === 1, '点亮书签 → 写入 csc_favorites');
g('navFavs').onclick();
ok(g('rankingOverlay').className.includes('open') && cards().length === 1, '收藏页只显示收藏的 1 条（同链接样例+社区去重）');
ok(g('rankingOverlay').textContent.includes('# 收藏'), '收藏页徽标显示 # 收藏');
const favBtn1 = cards()[0].children[0].children[3];
favBtn1.onclick();
ok(cards().length === 0 && g('rankingOverlay').textContent.includes('还没有收藏'), '收藏页内取消收藏 → 卡片即时离场并显示空态');
ok(JSON.parse(localStorage.getItem('csc_favorites')).length === 0, '取消收藏同步写回本机');
g('rankingOverlay').children[0].children[0].onclick();
ok(!g('rankingOverlay').className.includes('open'), '返回键关闭收藏页');
/* 重开榜单页：后续画像段（14）依赖榜单页顶部的画像卡 */
g('navFavs').onclick();

/* ---------- 12c. 收藏导出/导入（与 APP sleep_station_favorites.json 互通） ---------- */
const favBtnRow = [...g('rankingOverlay').querySelectorAll('button')];
const importBtn = favBtnRow.find(b => b.textContent === '导入收藏');
const exportBtn = favBtnRow.find(b => b.textContent === '导出收藏');
ok(!!importBtn && !!exportBtn, '收藏页带 导出收藏/导入收藏 按钮');
/* 导入：APP 导出的 RelaxItem 数组（含 www/尾斜杠变体与坏数据） */
g('favFileImport').files = [{ content: JSON.stringify([
  { id: 1, title: '站点A', url: 'https://example.com/a', isCustom: true },
  { id: 2, title: '站点B', url: 'https://www.example.com/b/', isCustom: true },
  { id: 3, title: '', url: 'https://example.com/c', isCustom: true }
]) }];
importBtn.onclick = () => { g('favFileImport').onchange({ target: g('favFileImport') }); };
importBtn.onclick();
await sleep(20);
const favStoreAfterImport = JSON.parse(localStorage.getItem('csc_favorites'));
ok(favStoreAfterImport.length === 2 && favStoreAfterImport.some(x => x.url === 'https://www.example.com/b/') && favStoreAfterImport.some(x => x.title === '站点A'), '导入 2 条有效收藏（原样 URL+标题入库）', JSON.stringify(favStoreAfterImport));
ok(cards().length === 2, '导入的站外收藏直接成卡（池外条目可见）');
ok(g('rankingOverlay').textContent.includes('站点B'), '导入后收藏页即时重渲染');
ok(g('rankingOverlay').textContent.includes('已导入 2 条收藏 · 跳过 1 条'), '导入结果提示（含跳过计数）');
/* 再导一次同文件：全部判重 */
importBtn.onclick();
await sleep(20);
ok(g('rankingOverlay').textContent.includes('已导入 0 条收藏 · 跳过 3 条'), '重复导入全判重（urlKey 合并）');
/* 导出：捕获 Blob 与下载文件名 */
let lastA = null;
const origCreate = document.createElement;
document.createElement = tag => { const el = origCreate(tag); if (tag === 'a') lastA = el; return el; };
exportBtn.onclick();
document.createElement = origCreate;
const exported = JSON.parse(globalThis.__lastBlob.parts[0]);
ok(Array.isArray(exported) && exported.length === 2, '导出 JSON 含 2 条收藏');
ok(lastA && lastA.download === 'sleep_station_favorites.json', '导出文件名与 APP 同名', lastA && lastA.download);
ok(exported.every(x => x.isCustom === true && x.title && x.url), '导出条目为 RelaxItem 兼容形状（isCustom/title/url）');
ok(exported.some(x => x.url === 'https://www.example.com/b/'), '导出保留原 URL 不改写');
/* ---------- 13. 入场动画两段式（重播路径） ---------- */
sessionStore.delete('csc_intro_done');
playIntro();
ok(bodyKids.filter(n => n.id === 'intro').length === 1, '重播重建入场遮罩');
const replayIntro = bodyKids.filter(n => n.id === 'intro').pop();
await sleep(900);
ok(replayIntro.children[0].children[0].textContent.length > 0, '重播正在打字');
replayIntro.dispatch('click');   /* 第一次交互：显示全文并停住 */
ok(replayIntro.children[0].children[0].classList.contains('done'), '第一次交互显示全文');
ok(!replayIntro.classList.contains('bye'), '显示全文后停住，不自动进入');
replayIntro.dispatch('click');   /* 第二次交互：进入网站 */
ok(replayIntro.classList.contains('bye'), '第二次交互进入网站（淡出）');
await sleep(2600);
ok(!bodyKids.some(n => n.id === 'intro' && !n._removed), '淡出后遮罩移除');

/* ---------- 14. 匿名画像（选填，榜单页顶部，默认收起为单行入口） ---------- */
const pc = () => registry.rankingOverlay.querySelectorAll('.profile-card')[0];
ok(!!pc(), '榜单页渲染画像卡');
ok(pc().querySelectorAll('.profile-title')[0].textContent === '完善画像（选填）', '画像卡标题文案');
const pInputs = () => registry.rankingOverlay.querySelectorAll('.profile-card input, .profile-card select');
ok(pInputs().length === 0, '画像默认收起（不展开占篇幅）');
const togglePre = pc().querySelectorAll('.profile-toggle')[0];
ok(togglePre.textContent === '填写', '未填时入口按钮文案');
ok(pc().querySelectorAll('.profile-hint')[0].textContent === '仅作统计研究使用，推荐填写！', '收起时标题右侧紧接提示文案');
ok(pc().querySelectorAll('.profile-hint.inline')[0].className.includes('profile-hint'), '提示文案内联跟随标题');
togglePre.onclick();  /* 展开表单 */
ok(pc().classList.contains('open'), '展开为浮层显示（不挤占榜单）');
ok(pc().querySelectorAll('.profile-hint')[0].textContent === '仅作统计研究使用，推荐填写！', '画像卡提示文案（仅作统计研究使用）');
ok(pInputs().length === 4, '画像卡含 昵称/年龄/性别/学历 四项', pInputs().length);
pInputs()[0].value = '夜猫子';
pInputs()[1].value = '00s';
pInputs()[2].value = 'male';
pInputs()[3].value = 'master';
await pc().querySelectorAll('.profile-save')[0].onclick();
const profileStore = () => JSON.parse(storage.get('csc_profile') || '{}');
ok(profileStore().nickname === '夜猫子' && profileStore().age === '00s' && profileStore().gender === 'male' && profileStore().education === 'master', '画像保存入库（昵称/年龄/性别/学历）', profileStore());
const pcSaved = () => registry.rankingOverlay.querySelectorAll('.profile-card')[0];
ok(pcSaved().querySelectorAll('.profile-summary')[0].textContent.includes('夜猫子 · 00后 · 男 · 硕士'), '已保存后收起为单行摘要（匿名昵称+画像）', pcSaved().querySelectorAll('.profile-summary')[0].textContent);
ok(pInputs().length === 0, '已填后仍默认收起', pInputs().length);
const profileRaw = JSON.parse(storage.get('csc_profile') || '{}');
ok(!!profileRaw.uid && profileRaw.uid.indexOf('u') === 0, '自动生成匿名设备 uid（csc_uid 体系）', profileRaw.uid);
pcSaved().onclick();  /* 点击模块框框（非按钮）也可展开 */
ok(!!pcSaved() && pcSaved().classList.contains('open'), '点击模块框框即可展开填写', !!pcSaved() && pcSaved().className);
pcSaved().querySelectorAll('.profile-head')[0].onclick();  /* 展开态点模块框头可收起 */
ok(!pcSaved().classList.contains('open'), '展开态点击模块框也可收起', pcSaved().className);

/* ---------- 15. 无效链接 ---------- */
g('fTitle').value = '';
g('fUrl').value = 'not a url at all';
await g('fSubmit').onclick();
ok(g('fMsg').textContent === '链接无效，请检查', '无效链接文案');

console.log('\nALL PASS: ' + pass + ' assertions');
