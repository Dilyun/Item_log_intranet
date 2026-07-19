# Discord 거래 로그 봇

Discord 거래 보고서 메시지를 파싱하고 Supabase(PostgreSQL)에 저장한 뒤, 별도
Discord 웹훅으로 결과를 알리는 Node.js 봇입니다. Express와 MySQL은 사용하지
않습니다.

## 구조

```text
.
├─ backend/
│  ├─ index.js
│  ├─ package.json
│  └─ Dockerfile
├─ database/
│  └─ init.sql
├─ .env.example
└─ render.yaml
```

## Supabase 준비

1. Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 `database/init.sql` 전체를 실행합니다.
3. `faction_settings.faction_emoji`를 실제 팩션 이모지로 수정합니다.
4. 판매자를 `users`에 등록합니다.

```sql
UPDATE faction_settings
SET faction_emoji = '🐍', public_account_rate = 50
WHERE id = (SELECT id FROM faction_settings ORDER BY id LIMIT 1);

INSERT INTO users (discord_id, user_code, nickname, role)
VALUES ('123456789012345678', 123, '딜연', 1);
```

서버에서 실행되는 봇에는 `SUPABASE_SERVICE_ROLE_KEY` 사용을 권장합니다. ANON
키는 공개 키이며 비밀 키가 아닙니다. ANON 키만 사용하면 RLS 정책에 봇이 필요한
조회·삽입 권한을 열어야 하고, 같은 키를 가진 브라우저도 그 권한을 사용할 수
있습니다. Service Role Key는 Render 환경 변수에만 저장하고 프론트엔드에 절대
노출하지 마세요.

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

## 프론트엔드 참고

Express API는 제거되었습니다. 기존 `frontend`는 별도로 Supabase 조회 방식으로
변경해야 합니다. 브라우저에서는 ANON 키만 사용하고, `users` 같은 민감한 테이블과
쓰기 작업은 반드시 RLS 정책으로 보호하세요.
