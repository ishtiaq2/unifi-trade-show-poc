# One image for every gRPC device simulator — the run command selects
# which device starts, so four near-identical Dockerfiles aren't needed
# for four near-identical Node processes.
FROM node:22-slim
WORKDIR /app

# Manifests first, install second, source last: a source edit then
# doesn't invalidate the cached dependency layer.
COPY package.json package-lock.json ./

# Full install, NOT --omit=dev: these run through ts-node, so ts-node
# and typescript are genuinely runtime dependencies here.
RUN npm ci

COPY . .

# Sensible default so `docker run <image>` with no command does
# something. Override per device:  ... npm run camera-grpc-flaky
CMD ["npm", "run", "camera-grpc"]
