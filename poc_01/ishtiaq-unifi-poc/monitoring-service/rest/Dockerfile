# REST API for the device monitoring PoC — step 4.
#
# NOTE ON BUILD CONTEXT: src/index.ts imports from
# ../../datasource-module/datasource/sql-service, and Docker cannot
# COPY from outside the build context. So the context is
# monitoring-service/ (the parent of BOTH rest/ and datasource-module/),
# not rest/ alone — same reasoning as datasource-module's own
# Dockerfile, one level up. See docker-compose.yml.
#
# This means datasource-module is NOT a separate running container that
# rest calls over the network. Its source is copied into this image and
# imported in-process, the way a repository layer normally sits under
# its HTTP API — datasource-module's own container is for running ITS
# test in isolation, not for serving requests.
#
# Runs via ts-node, like every other module in this project, not a
# compiled build: noEmit stays true in tsconfig.json, so there is no
# risk of a stale compiled .js silently shadowing an edited .ts file.
FROM node:22-slim
WORKDIR /app

# Manifests first, install second, source last — a source edit doesn't
# invalidate the cached dependency layers.
COPY rest/package.json rest/package-lock.json rest/tsconfig.json ./rest/
COPY datasource-module/package.json datasource-module/package-lock.json ./datasource-module/

# Full installs, not --omit=dev: both run through ts-node, so ts-node
# and typescript are genuine runtime dependencies here.
RUN cd rest && npm ci
RUN cd datasource-module && npm ci

COPY datasource-module/domain ./datasource-module/domain
COPY datasource-module/datasource ./datasource-module/datasource
COPY rest/src ./rest/src

WORKDIR /app/rest
EXPOSE 3000
CMD ["npx", "ts-node", "src/index.ts"]
