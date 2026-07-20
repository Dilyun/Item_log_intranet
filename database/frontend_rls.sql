-- 프론트엔드(anon key)용 최소 RLS 예시
-- Supabase SQL Editor에서 실행하세요.
-- Realtime을 쓰려면 Database > Replication에서 trade_logs를 활성화하세요.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faction_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_logs ENABLE ROW LEVEL SECURITY;

-- 기존 정책이 있다면 먼저 제거
DROP POLICY IF EXISTS "public read users" ON public.users;
DROP POLICY IF EXISTS "public write users" ON public.users;
DROP POLICY IF EXISTS "public read items" ON public.items;
DROP POLICY IF EXISTS "public write items" ON public.items;
DROP POLICY IF EXISTS "public read faction" ON public.faction_settings;
DROP POLICY IF EXISTS "public write faction" ON public.faction_settings;
DROP POLICY IF EXISTS "public read trade_logs" ON public.trade_logs;
DROP POLICY IF EXISTS "service insert trade_logs" ON public.trade_logs;

-- 읽기: 대시보드 표시용 (anon 포함)
CREATE POLICY "public read users"
  ON public.users FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "public read items"
  ON public.items FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "public read faction"
  ON public.faction_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "public read trade_logs"
  ON public.trade_logs FOR SELECT
  TO anon, authenticated
  USING (true);

-- 쓰기: 현재 구조는 Discord Auth JWT가 없으므로
-- 개발/소규모 운영용으로 anon 쓰기를 허용합니다.
-- 공개 서비스라면 Supabase Auth(Discord) 연동 후 auth.uid() 기반으로 교체하세요.
CREATE POLICY "public write users"
  ON public.users FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "public write items"
  ON public.items FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "public write faction"
  ON public.faction_settings FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- trade_logs INSERT는 봇(service_role)만 수행하는 것을 권장합니다.
-- service_role은 RLS를 우회하므로 별도 INSERT 정책이 없어도 됩니다.
