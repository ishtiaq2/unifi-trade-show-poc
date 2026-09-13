# unifi-products-demo/src/monitoring-service/Dockerfile

FROM node:22-slim
WORKDIR /app

# 1. Copy manifests first to leverage Docker layer caching
COPY package.json package-lock.json ./
COPY datasource-module/package.json datasource-module/package-lock.json ./datasource-module/

# 2. Install dependencies for both the main service and the local module
RUN npm ci
RUN cd datasource-module && npm ci

# 3. Copy all source code (this handles index.ts, http/, service/, clients/, etc.)
COPY . .

EXPOSE 3000

# 4. Run directly from the root of /app
CMD ["npx", "ts-node", "index.ts"]
