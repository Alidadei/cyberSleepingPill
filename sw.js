/* 电子安眠药 Service Worker（零依赖手写，无构建链）。
   职责只有一件：主站壳子（index.html）离线兜底。
   策略：导航请求一律网络优先——在线拿最新（本站更新频繁，不搞版本钉死），
   成功顺带刷新缓存；离线/断网回退缓存。其余一切（/adm、/data、assets、
   Supabase、Google Fonts、B 站 JSONP……）不拦不缓存，行为与无 SW 完全一致。
   改动本文件时把 CACHE 版本号 +1 以清掉旧缓存。 */
const CACHE = 'csp-shell-v1';
const SHELL = './index.html';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const scopeDir = new URL('./', self.registration.scope).pathname;
  const isShell = url.pathname === scopeDir || url.pathname === scopeDir + 'index.html';
  if (!(req.mode === 'navigate' && isShell)) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(SHELL, copy));
        }
        return res;
      })
      .catch(() => caches.match(SHELL).then((hit) => hit || Response.error()))
  );
});
