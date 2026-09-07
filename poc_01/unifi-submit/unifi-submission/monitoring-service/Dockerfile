# Multi-stage: compile with dev dependencies, ship only compiled output
# plus production dependencies. Unlike the device simulators (which run
# through ts-node and therefore need TypeScript at runtime), the service
# is compiled ahead of time — smaller image, faster start, no transpile
# cost on the critical path.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json tsconfig.build.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
