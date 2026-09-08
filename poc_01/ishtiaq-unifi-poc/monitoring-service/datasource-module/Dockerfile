# Datasource module — runs the integration test against a real Postgres.
#
# NOTE ON BUILD CONTEXT: datasource/sql-monitoringService.ts imports ../domain/types,
# and Docker cannot COPY from outside the build context. So the context
# is this directory (the module root containing BOTH datasource/ and
# domain/), not datasource/ itself. docker-compose.yml sets that up.
FROM node:22-slim
WORKDIR /app

# Manifests first, install second, source last: a source edit then
# doesn't invalidate the cached dependency layer.
COPY package.json package-lock.json tsconfig.json ./

# Full install, NOT --omit=dev: this image runs the test through
# ts-node, so ts-node and typescript are genuinely needed at runtime.
RUN npm ci

COPY domain ./domain
COPY datasource ./datasource

# Default to running the test. Override to do anything else:
#   docker compose run --rm datasource npx tsc --noEmit
CMD ["npm", "test"]
