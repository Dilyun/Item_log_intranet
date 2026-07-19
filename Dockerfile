# Render Docker 배포용 (빌드 컨텍스트 = 저장소 루트)
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY backend/index.js ./

USER node

CMD ["node", "index.js"]
