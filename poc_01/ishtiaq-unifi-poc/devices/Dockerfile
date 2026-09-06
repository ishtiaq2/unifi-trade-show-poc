# One image for every device simulator — docker-compose.yml selects which
# one to run via its `command`, so 6 near-identical Dockerfiles aren't
# needed for 6 near-identical Node processes.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
