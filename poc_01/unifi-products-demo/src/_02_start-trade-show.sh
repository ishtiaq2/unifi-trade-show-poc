#!/usr/bin/env bash
set -e

# Jump to the root src/ directory
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "====================================================="
echo "  BOOTING UNIFI FLEET DEMO (VERBOSE MODE)"
echo "====================================================="

echo "==> 1. Starting Database..."
(cd db && podman-compose down -v >/dev/null 2>&1 || true && podman-compose up -d)

echo "==> 2. Starting Hardware Simulators..."
# Bypassing the interactive clean-slate script to fully automate the boot
(cd devices && podman-compose down >/dev/null 2>&1 || true && podman-compose up -d --build)

echo "==> 3. Starting Monitoring Service..."
(cd monitoring-service && podman-compose down >/dev/null 2>&1 || true && podman-compose up -d --build)

echo -e "\n\e[1;32m=====================================================\e[0m"
echo -e "\e[1;32m ✔ SYSTEM IS UP! Tailing live logs...\e[0m"
echo -e "\e[1;32m=====================================================\e[0m\n"

echo -e "\e[1;36m📋 DEMO CHEAT SHEET (Open a second terminal to run these)\e[0m"
echo -e "\e[33m--- API Health & Discovery ---\e[0m"
echo -e "Check API Health:    \e[32mcurl http://localhost:3000/healthz\e[0m"
echo -e "List all devices:    \e[32mcurl http://localhost:3000/devices\e[0m"

echo -e "\n\e[33m--- Register REST Devices ---\e[0m"
echo -e "Add Router:          \e[32mcurl -X POST http://localhost:3000/devices -H 'Content-Type: application/json' -d '{\"name\":\"router-1\",\"address\":\"router:4001\"}'\e[0m"
echo -e "Add Switch:          \e[32mcurl -X POST http://localhost:3000/devices -H 'Content-Type: application/json' -d '{\"name\":\"switch-1\",\"address\":\"switch:4002\"}'\e[0m"
echo -e "Add REST Camera:     \e[32mcurl -X POST http://localhost:3000/devices -H 'Content-Type: application/json' -d '{\"name\":\"camera-rest-1\",\"address\":\"camera-rest:4003\"}'\e[0m"
echo -e "Add REST Door:       \e[32mcurl -X POST http://localhost:3000/devices -H 'Content-Type: application/json' -d '{\"name\":\"door-access-rest-1\",\"address\":\"door-access-rest:4004\"}'\e[0m"

echo -e "\n\e[33m--- Register gRPC Devices ---\e[0m"
echo -e "Add gRPC Camera:     \e[32mcurl -X POST http://localhost:3000/devices -H 'Content-Type: application/json' -d '{\"name\":\"camera-grpc-1\",\"address\":\"camera-grpc:4005\"}'\e[0m"
echo -e "Add gRPC Door:       \e[32mcurl -X POST http://localhost:3000/devices -H 'Content-Type: application/json' -d '{\"name\":\"door-access-grpc-1\",\"address\":\"door-access-grpc:4006\"}'\e[0m"

echo -e "\n\e[33m--- Diagnostics & Removal ---\e[0m"
echo -e "View Diagnostics:    \e[32mcurl http://localhost:3000/devices/<UUID_HERE>\e[0m"
echo -e "Remove Device:       \e[32mcurl -i -X DELETE http://localhost:3000/devices/<UUID_HERE>\e[0m"

# Follow the logs of the monitoring API continuously
podman logs -f monitoring-service_rest_1
