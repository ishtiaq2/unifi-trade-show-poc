## unifi-products-demo/src/devices/Dockerfile

# One image for every device simulator — the run command selects which
# device to start.

FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./

# install
RUN npm ci

# copy files to /app dir of each container
COPY . .
