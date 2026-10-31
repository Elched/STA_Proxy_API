# ==============================================================================
# Thales SafeNet Trusted Access (STA) Granular API Proxy
# Multi-Stage Production Dockerfile (Non-root, hardened, healthchecked)
# ==============================================================================

# Stage 1: Build frontend UI assets
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first for optimal Docker layer caching
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Copy source code and build client bundle
COPY . .
RUN npm run build

# Stage 2: Minimal production runtime
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install curl for healthcheck
RUN apk add --no-cache curl

# Install production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Also install tsx for server-side TypeScript execution in production
RUN npm install -g tsx

# Copy built frontend assets from builder
COPY --from=builder /app/dist ./dist

# Copy backend server source and configuration
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/metadata.json ./metadata.json

# Create directory for optional TLS certificates
RUN mkdir -p /etc/ssl/certs /app/data && chown -R node:node /app /etc/ssl/certs

# Switch to unprivileged non-root user for security hardening
USER node

# Expose standard gateway port
EXPOSE 3000

# Container healthcheck querying proxy stats
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/stats || exit 1

# Start full-stack reverse proxy server
CMD ["tsx", "server.ts"]
