# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /build

# Install deps first (layer-cached separately from source)
COPY app/package.json app/package-lock.json ./
RUN npm ci --prefer-offline

# Copy source and build
COPY app/ ./
RUN npm run build

# ── Stage 2: serve ──────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS server

# Remove default Nginx config
RUN rm -f /etc/nginx/conf.d/default.conf

# Custom SPA-aware Nginx config
COPY docker/nginx.conf /etc/nginx/conf.d/paper.conf

# Copy built assets from builder
COPY --from=builder /build/dist /usr/share/nginx/html

# Nginx runs on port 80 by default; expose for documentation
EXPOSE 80

# Healthcheck: verify Nginx is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
