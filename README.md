# Discord 거래 로그 봇

Discord 거래 보고서 메시지를 파싱하고 Supabase(PostgreSQL)에 저장한 뒤, 별도
Discord 웹훅으로 결과를 알리는 Node.js 봇과 Vite/React 관리자 대시보드입니다.

## 구조

```text
.
├─ backend/
│  ├─ index.js
│  ├─ package.json
│  └─ Dockerfile
├─ frontend/
│  ├─ src/App.tsx
│  ├─ src/components/
│  └─ .env.local.example
├─ database/
│  ├─ init.sql
│  └─ frontend_rls.sql
├─ .env.example
└─ render.yaml
```

## Supabase 준비

1. Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 `database/init.sql` 전체를 실행합니다.
3. 프론트엔드용으로 `database/frontend_rls.sql`을 실행합니다.
4. Database → Replication에서 `trade_logs` Realtime을 활성화합니다.
5. `faction_settings.faction_emoji`를 실제 팩션 이모지로 수정합니다.
6. 관리자/판매자를 `users`에 등록합니다.

```sql
UPDATE faction_settings
SET faction_emoji = '🐍', public_account_rate = 50
WHERE id = (SELECT id FROM faction_settings ORDER BY id LIMIT 1);

INSERT INTO users (discord_id, user_code, nickname, role)
VALUES ('123456789012345678', 7259, '관리자', 2);
```

서버에서 실행되는 봇에는 `SUPABASE_SERVICE_ROLE_KEY` 사용을 권장합니다. ANON
키는 공개 키이며 비밀 키가 아닙니다. Service Role Key는 Render 환경 변수에만
저장하고 프론트엔드에 절대 노출하지 마세요.

## Discord 설정

Discord Developer Portal의 Bot 설정에서 **Message Content Intent**를
활성화합니다. `.env`의 `TRADE_LOG_CHANNEL_ID`에는 거래 보고서가 올라오는 채널
ID를 넣습니다. 웹훅 메시지는 `author.bot=true`이므로 봇 메시지라는 이유로
제외하지 않도록 구현되어 있습니다.

## 로컬 실행

```bash
cp .env.example .env
# .env 값 수정
cd backend
npm ci
npm start
```

정상 실행 시 `Discord 봇 로그인 완료`가 출력됩니다.

## Render 배포

이 프로젝트는 HTTP 포트를 열지 않는 봇이므로 Render의 **Web Service가 아니라
Background Worker**로 배포해야 합니다.

1. 저장소를 GitHub에 올립니다.
2. Render Dashboard에서 New → Blueprint를 선택합니다.
3. 저장소를 연결하면 루트의 `render.yaml`이 Worker를 구성합니다.
4. 다음 Secret 환경 변수를 입력합니다.
   - `DISCORD_TOKEN`
   - `TRADE_LOG_CHANNEL_ID`
   - `ALERT_WEBHOOK_URL`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. 배포 로그에서 Discord 로그인 완료 메시지를 확인합니다.

직접 Worker를 생성한다면 Root Directory는 `backend`, Build Command는
`npm ci`, Start Command는 `npm start`로 설정합니다.

## 정산 규칙

- 일반 아이템: `items.price_per_unit × quantity`
- `💸 검은 돈`: DB 기본가는 12,000,000원이지만 거래 로그의 총 금액은
  `1,200,000 × quantity`
- 총 금액은 JavaScript `BigInt`로 계산하고 Supabase에는 문자열로 전달하여
  정밀도 손실을 방지합니다.

Supabase 저장 성공 후에만 알림 웹훅을 발송합니다. 알림 실패 시 이미 저장된 거래
로그는 삭제하지 않고 Render 로그에 오류를 남깁니다.

## 프론트엔드 (Vercel)

React + TypeScript + Tailwind 대시보드가 `frontend/`에 있습니다. Express 없이
Supabase를 직접 호출하며, 로그인은 **Supabase Auth Discord OAuth**를 사용합니다.

### Discord OAuth 설정
1. Discord Developer Portal → OAuth2 → Redirects에 아래를 등록합니다.
   - `https://<project-ref>.supabase.co/auth/v1/callback`
2. Supabase → Authentication → Providers → Discord 활성화 후 Client ID/Secret 입력
3. Supabase → Authentication → URL Configuration에 사이트 URL 추가
   - 로컬: `http://localhost:5173`
   - Vercel: `https://your-app.vercel.app`
4. `users` 테이블에 해당 Discord ID가 등록되어 있어야 로그인됩니다.

로컬:

```bash
cd frontend
cp .env.local.example .env.local
# VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 입력
npm ci
npm run dev
```

- 일반 유저: 실시간 로그만 표시
- 관리자(`role=2`): 유저 관리 / 아이템·진영 설정 탭 표시

Vercel 배포:
1. Root Directory = `frontend`
2. 환경 변수 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 설정
3. Framework Preset = Vite
4. Supabase에서 `trade_logs` Realtime 활성화 + `frontend_rls.sql` 적용

Realtime이 꺼져 있으면 로그 목록은 로드되지만 자동 갱신은 되지 않습니다.

