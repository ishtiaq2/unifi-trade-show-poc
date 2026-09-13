#!/usr/bin/env bash
set -e

# Ensure we are in the script's directory (src/devices)
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "==> 1. Stopping and removing all device containers and networks..."
podman-compose down -v --rmi local >/dev/null 2>&1 || true

echo "==> 2. Forcibly removing the shared unifi-devices image..."
podman rmi -f unifi-devices localhost/unifi-devices >/dev/null 2>&1 || true

echo "==> 3. Pruning hidden buildah artifacts and dangling images..."
podman ps --external -aq | xargs -r podman rm -f >/dev/null 2>&1 || true
podman container prune -f >/dev/null 2>&1 || true
podman image prune -f >/dev/null 2>&1 || true

echo -e "\n✔ Clean slate achieved!"

# Pause and wait for user input
read -p "Press [Enter] to proceed with the build (podman-compose up -d --build)..."

echo -e "\n==> 4. Building and starting device containers..."
podman-compose up -d --build
