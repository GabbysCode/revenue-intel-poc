FROM node:20-alpine

WORKDIR /app

# Install dependencies first so the layer is cached when only source changes.
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build for production. App Router output ends up in `.next/`.
COPY . .
RUN npm run build

EXPOSE 3000

# `next start` honours BACKEND_UPSTREAM via the rewrite in next.config.js,
# so docker-compose / Databricks Apps just need to set that env var.
CMD ["npm", "run", "start", "--", "-p", "3000", "-H", "0.0.0.0"]
