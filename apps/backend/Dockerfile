# ─────────────────────────────────────────────
#  Backend Dockerfile — Node.js Express API
# ─────────────────────────────────────────────

FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# lmsdata volume mount point
RUN mkdir -p /app/lmsdata

EXPOSE 5000

# Use dumb-init so Node receives OS signals correctly (graceful shutdown)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
