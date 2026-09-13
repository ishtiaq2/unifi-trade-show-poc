#!/usr/bin/env bash

echo -e "\n\e[1;35m🔍 PRE-FLIGHT ENVIRONMENT VERIFICATION\e[0m"
echo -e "\e[90m=====================================================\e[0m\n"

ERRORS=0

# 1. Verify Required CLI Tools
echo -e "\e[1;34m1. Checking Required CLI Tooling...\e[0m"
REQUIRED_TOOLS=("curl" "jq" "grep" "tr")
for tool in "${REQUIRED_TOOLS[@]}"; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo -e "  \e[32m✔\e[0m Found \e[1m$tool\e[0m"
  else
    echo -e "  \e[31m✖ Missing tool:\e[0m \e[1m$tool\e[0m (Please install $tool)"
    ERRORS=$((ERRORS + 1))
  fi
done

# 2. Detect Container Engine & Compose Tool
echo -e "\n\e[1;34m2. Detecting Container Engine & Compose...\e[0m"
if command -v podman-compose >/dev/null 2>&1; then
  echo -e "  \e[32m✔\e[0m Engine: \e[1mPodman\e[0m (podman-compose)"
elif docker compose version >/dev/null 2>&1; then
  echo -e "  \e[32m✔\e[0m Engine: \e[1mDocker\e[0m (docker compose)"
elif command -v docker-compose >/dev/null 2>&1; then
  echo -e "  \e[32m✔\e[0m Engine: \e[1mDocker\e[0m (docker-compose)"
else
  echo -e "  \e[31m✖ Neither podman-compose nor docker compose was found!\e[0m"
  ERRORS=$((ERRORS + 1))
fi

# 3. Verify Host Port Availability
echo -e "\n\e[1;34m3. Checking Required Host Ports...\e[0m"
PORTS=(3000 5432 4001 4002 4003 4004 4005 4006)
for port in "${PORTS[@]}"; do
  # Use Bash zero-dependency socket check
  if (echo > /dev/tcp/127.0.0.1/$port) >/dev/null 2>&1; then
    echo -e "  \e[31m✖ Port $port is ALREADY IN USE on host!\e[0m"
    ERRORS=$((ERRORS + 1))
  else
    echo -e "  \e[32m✔\e[0m Port \e[1m$port\e[0m is available"
  fi
done

echo -e "\n\e[90m=====================================================\e[0m"
if [ $ERRORS -eq 0 ]; then
  echo -e "\e[1;32m🎉 PRE-FLIGHT CHECK PASSED: Environment is ready!\e[0m\n"
  exit 0
else
  echo -e "\e[1;31m❌ PRE-FLIGHT CHECK FAILED: Found $ERRORS issue(s).\e[0m\n"
  exit 1
fi
