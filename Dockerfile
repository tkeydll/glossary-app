# Multi-stage Dockerfile for glossary app (API + proxy + static)
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies separately to leverage layer caching
COPY package.json package-lock.json* ./
RUN npm install --production --no-audit --no-fund || npm install --production --no-audit --no-fund

# Copy source
COPY . .

# Expose ports: 8080 static, 3001 API, 3002 proxy
EXPOSE 8080 3001 3002

# Non-root user for security
RUN addgroup -S app && adduser -S app -G app
USER app

ENV NODE_ENV=production \
    PORT=3001 \
    PROXY_PORT=3002 \
    STATIC_PORT=8080 \
    AI_USE_PROXY=false \
    API_ENABLED=true

# Default command launches all three services
CMD ["node", "all-in-one.js"]
