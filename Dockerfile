# ── Build stage: compile frontend (vite) + backend (tsc) ─────────────
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build && npm run build:server

# ── Runtime stage: prod deps + compiled output only ──────────────────
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
# tsc doesn't copy .sql migrations — bring them into the runtime image so the
# startup migration runner (dist/server/db/connection.js) can find them.
COPY --from=build /app/server/db/migrations ./dist/server/db/migrations
EXPOSE 3100
CMD ["node", "dist/server/index.js"]
