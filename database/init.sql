-- Supabase Dashboard > SQL Editor에서 실행합니다.

CREATE TABLE IF NOT EXISTS public.users (
  discord_id VARCHAR(32) PRIMARY KEY,
  user_code INTEGER NOT NULL UNIQUE CHECK (user_code > 0),
  nickname VARCHAR(255) NOT NULL,
  role INTEGER NOT NULL DEFAULT 1 CHECK (role IN (0, 1, 2))
);

CREATE TABLE IF NOT EXISTS public.items (
  item_name VARCHAR(255) PRIMARY KEY,
  price_per_unit BIGINT NOT NULL CHECK (price_per_unit >= 0)
);

CREATE TABLE IF NOT EXISTS public.faction_settings (
  id SERIAL PRIMARY KEY,
  faction_emoji VARCHAR(64) NOT NULL,
  public_account_rate INTEGER NOT NULL DEFAULT 50
    CHECK (public_account_rate BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS public.trade_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seller_code INTEGER NOT NULL,
  seller_name VARCHAR(255) NOT NULL,
  buyer_code INTEGER NOT NULL,
  buyer_name VARCHAR(255) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  total_price BIGINT NOT NULL CHECK (total_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_logs_created_at
  ON public.trade_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_logs_seller_code
  ON public.trade_logs (seller_code);
CREATE INDEX IF NOT EXISTS idx_trade_logs_buyer_code
  ON public.trade_logs (buyer_code);
CREATE INDEX IF NOT EXISTS idx_trade_logs_item_name
  ON public.trade_logs (item_name);

INSERT INTO public.faction_settings (faction_emoji, public_account_rate)
SELECT '', 50
WHERE NOT EXISTS (SELECT 1 FROM public.faction_settings);

INSERT INTO public.items (item_name, price_per_unit) VALUES
  ('무기 박스 (방망이)', 30000000),
  ('무기 박스 (기본 칼)', 30000000),
  ('무기 박스 (도끼)', 30000000),
  ('무기 박스 (플래시라이트)', 30000000),
  ('무기 박스 (마이크로 SMG)', 50000000),
  ('무기 박스 (머신피스톨)', 50000000),
  ('무기 박스 (어썰트 라이플)', 100000000),
  ('무기 박스 (피스톨)', 50000000),
  ('탄약 박스 (9mm)', 5000000),
  ('탄약 박스 (5.56mm)', 5000000),
  ('탄약 박스 (45ACP)', 5000000),
  ('창고(10) 30일권', 2000000000),
  ('창고(20) 30일권', 3500000000),
  ('창고(30) 30일권', 4000000000),
  ('🎫 작업장 입장권', 50000000),
  ('📦 보약 원재료 박스A', 230000000),
  ('📦 보약 원재료 박스B', 690000000),
  ('📦 보약 원재료 박스C', 1150000000),
  ('📦 보약 원재료 박스D', 2350000000),
  ('🧨 C4', 60000000),
  ('[Q] 💉 진원단', 400000000),
  ('[Q] 🔥 침심고', 400000000),
  ('[Q] 🛢️ 청수유', 400000000),
  ('💸 검은 돈', 12000000)
ON CONFLICT (item_name) DO UPDATE
SET price_per_unit = EXCLUDED.price_per_unit;

-- 최초 유저/관리자 등록 예시:
-- INSERT INTO public.users (discord_id, user_code, nickname, role)
-- VALUES ('123456789012345678', 7259, '관리자', 2);

-- 실제 팩션 이모지 설정 예시:
-- UPDATE public.faction_settings
-- SET faction_emoji = '🐍', public_account_rate = 50
-- WHERE id = (SELECT id FROM public.faction_settings ORDER BY id LIMIT 1);

-- 주의:
-- 이 봇은 서버 환경의 SUPABASE_SERVICE_ROLE_KEY 사용을 권장합니다.
-- ANON KEY로 봇을 실행하려면 RLS 정책에서 users/items/faction_settings SELECT와
-- trade_logs INSERT/SELECT를 허용해야 하지만, 브라우저에도 같은 권한이 노출되므로
-- 운영 환경에서는 권장하지 않습니다.
