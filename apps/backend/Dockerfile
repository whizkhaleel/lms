# ─────────────────────────────────────────────
#  Backend Dockerfile — Node.js Express API
# ─────────────────────────────────────────────

FROM node:20-alpine AS base

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

RUN mkdir -p /app/lmsdata

EXPOSE 5000

ENTRYPOINT ["dumb-init", "--"]

# ── Production (default) ──────────────────────
FROM base AS production
CMD ["node", "server.js"]

# ── Worker ────────────────────────────────────
FROM base AS worker
CMD ["node", "workers/index.js"]

# ── Development ───────────────────────────────
FROM base AS development
CMD ["node", "server.js"]
