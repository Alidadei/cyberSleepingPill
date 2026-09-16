-- cyberSleepCommunity · Supabase 建表脚本（P1 数据互通）
--
-- 用法：
--   1. supabase.com 注册（免费档 0 元）→ New project
--   2. Dashboard → SQL Editor → 粘贴本文件全部内容 → Run
--   3. 把 Project Settings → API 里的 Project URL 和 anon public key
--      填进 index.html 顶部的 SUPABASE = { url, anonKey }，两值填齐即启用云端
--
-- 字段 = docs/DATA_CONTRACT.md §1 CommunityPick，一字不改。
-- 列名必须与 JSON 字段完全一致（REST 接口按 JSON key 映射列名），
-- addedAt 含大写字母因此加引号。

create table if not exists community_picks (
  id        bigint primary key,          -- epoch 毫秒，与 APP CommunityPick.id (Long) 一致
  title     text    not null,            -- 上限 80 字符（契约 §7，APP LinkParser 截断值）
  url       text    not null,            -- http(s) 链接
  type      text,                        -- anxiety/excitement/physical/noise 或 null
  ratings   int[]   not null default '{}',  -- 每项 1–5，打分=读回追加后整体 PATCH
  "addedAt" bigint  not null,            -- epoch 毫秒
  recommend_count int not null default 1  -- 同 URL 被提交的次数（重复提交 recommend_count+1，≥2 卡片展示）
);

-- 无账号社区：anon 角色即可读/写，权限靠 GRANT（表级）+ RLS（行级）双保险。
-- 显式 GRANT 保证「Automatically expose new tables」关闭时也能经 Data API 读写。
grant select, insert, update on public.community_picks to anon;
alter table community_picks enable row level security;

create policy "anon select" on community_picks
  for select to anon using (true);

create policy "anon insert" on community_picks
  for insert to anon with check (true);

create policy "anon update" on community_picks
  for update to anon using (true) with check (true);

-- 已知限制（有意取舍，P3 再收紧）：
-- anon update 不限制列，任何人可以覆盖任意行的 ratings 数组（并发打分互相覆盖）。
-- 社区规模小、内容无敏感数据，先接受；后续可拆 ratings 子表 + insert-only 策略。
--
-- 已有表升级 recommend_count（v1.2）：
-- ALTER TABLE community_picks ADD COLUMN IF NOT EXISTS recommend_count int not null default 1;
-- UPDATE community_picks SET recommend_count = 1 WHERE recommend_count IS NULL;

-- ============================================================
-- link_reports（v1.3 网站域数据，不进契约 §1）：链接失效举报
-- 设计：匿名访客对某条推荐报告「链接打不开」；(pick_id, uid) 唯一 → 一人一票自动去重。
-- 展示规则（网站端）：同一 pick_id 有 ≥2 个不同 uid 举报 → 卡片置灰 + 「多人报告链接可能已失效」徽标。
-- 无 update/delete 策略 → anon 只能插和读；站长清理走 dashboard（service role）：
--   查看汇总： select pick_id, count(distinct uid) as n from link_reports group by 1 order by n desc;
--   清理死链： delete from community_picks where id = <pick_id>;  delete from link_reports where pick_id = <pick_id>;
-- ============================================================
create table if not exists public.link_reports (
  pick_id    bigint   not null,          -- 对应 community_picks.id
  uid        text     not null,          -- 匿名设备标识（csc_uid）
  created_at timestamptz not null default now(),
  primary key (pick_id, uid)
);

grant select, insert on public.link_reports to anon;
alter table public.link_reports enable row level security;

create policy "anon select reports" on public.link_reports
  for select to anon using (true);

create policy "anon insert report" on public.link_reports
  for insert to anon with check (true);
