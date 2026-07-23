FROM node:24-alpine AS dependencies

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/miniprogram/package.json apps/miniprogram/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json

RUN npm ci --no-audit --no-fund

FROM dependencies AS builder

COPY apps/api apps/api
COPY packages packages

RUN npm run build --workspace @jiayan/api

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json

RUN npm ci --omit=dev --no-audit --no-fund --workspace @jiayan/api

COPY --from=builder /app/apps/api/dist apps/api/dist

USER node
EXPOSE 3000

CMD ["node", "apps/api/dist/server.js"]
