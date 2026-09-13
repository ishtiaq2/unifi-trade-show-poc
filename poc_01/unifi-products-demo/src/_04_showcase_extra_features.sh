#!/usr/bin/env bash

echo -e "\n\e[1;35m🚀 UNIFI MONITORING FLEET - ADVANCED FEATURE SHOWCASE\e[0m"
echo -e "\e[90m=====================================================\e[0m\n"

echo -e "\e[1;34m1. UNIFIED REST/gRPC DISCOVERY\e[0m"
curl -s http://localhost:3000/devices | jq '.[] | {name: .name, protocol: .protocol, status: .status}'

echo -e "\n\e[1;34m2. DEEP DEVICE DIAGNOSTICS & TELEMETRY\e[0m"
DEV_ID=$(curl -s http://localhost:3000/devices | jq -r '.[0].id')
curl -s http://localhost:3000/devices/$DEV_ID | jq '{
  name: .device.name,
  status: .device.status,
  address: .device.address,
  protocol: .device.protocol,
  diagnostics: .diagnostics
}'

echo -e "\n\e[1;34m3. INPUT VALIDATION GUARDRAILS (Zod Error Handling)\e[0m"
curl -s -X POST http://localhost:3000/devices -H "Content-Type: application/json" -d '{"invalid":"payload"}' | jq .
