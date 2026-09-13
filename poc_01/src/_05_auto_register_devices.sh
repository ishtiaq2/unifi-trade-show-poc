#!/usr/bin/env bash

echo -e "\n\e[1;35m🤖 AUTOMATED FLEET DISCOVERY & REGISTRATION\e[0m"
echo -e "\e[90m=====================================================\e[0m\n"

# Fetch currently registered device addresses from the API
REGISTERED_ADDRS=$(curl -s http://localhost:3000/devices | jq -r '.[].address // empty')

# List active Podman container names
RUNNING_CONTAINERS=$(podman ps --format "{{.Names}}")

# Fleet mapping table: "container_keyword|device_name|device_address"
FLEET=(
  "router|router-1|router:4001"
  "switch|switch-1|switch:4002"
  "camera-rest|camera-rest-1|camera-rest:4003"
  "door-access-rest|door-access-rest-1|door-access-rest:4004"
  "camera-grpc|camera-grpc-1|camera-grpc:4005"
  "door-access-grpc|door-access-grpc-1|door-access-grpc:4006"
)

for entry in "${FLEET[@]}"; do
  IFS="|" read -r match_key dev_name dev_addr <<< "$entry"

  # Check if container is running in podman ps
  if echo "$RUNNING_CONTAINERS" | grep -q "$match_key"; then
    # Check if device is already registered in the API
    if echo "$REGISTERED_ADDRS" | grep -q "$dev_addr"; then
      echo -e " \e[33m[SKIP]\e[0m Device \e[1m$dev_name\e[0m ($dev_addr) is already registered."
    else
      echo -e " \e[32m[REGISTERING]\e[0m Found container for \e[1m$dev_name\e[0m ($dev_addr)..."
      curl -s -X POST http://localhost:3000/devices \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"$dev_name\",\"address\":\"$dev_addr\"}" | jq -c .
    fi
  else
    echo -e " \e[31m[OFFLINE]\e[0m Container for '$dev_name' is not running."
  fi
done

echo -e "\n\e[1;32m✔ Fleet auto-registration check complete.\e[0m\n"
