# One image for every device simulator — the run command selects which
# device to start, so 6 near-identical Dockerfiles aren't needed for 6
# near-identical Node processes.
FROM node:22-slim
WORKDIR /app

# Manifests first, install second, source last: this ordering means a
# source edit doesn't invalidate the cached dependency layer, so rebuilds
# during development skip a full reinstall.
COPY package.json package-lock.json ./

# Full install, NOT --omit=dev: these simulators run through ts-node, so
# `ts-node` and `typescript` (devDependencies) are genuinely required at
# runtime here. This differs deliberately from monitoring-service, which
# compiles ahead of time and ships only production dependencies.
RUN npm ci

COPY . .

# A sensible default so `podman run <image>` with no command does
# something rather than silently nothing. Override per device:
#   podman run ... unifi-devices npm run camera-rest
# CMD ["npm", "run", "router"]
