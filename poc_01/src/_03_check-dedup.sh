#!/usr/bin/env bash

# Fetch counts from the 'poc' database and strip whitespace
DEVS=$(podman exec -i unifi-db psql -U poc -d poc -t -c "SELECT COUNT(*) FROM devices;" | tr -d ' ')
DIAGS=$(podman exec -i unifi-db psql -U poc -d poc -t -c "SELECT COUNT(*) FROM diagnostics;" | tr -d ' ')

echo -e "\n\e[1;35m🔍 DATABASE DEDUPLICATION ENGINE\e[0m"
echo -e "\e[90m=====================================================\e[0m"
echo -e " \e[1;36mRegistered Devices:\e[0m      \e[1;32m${DEVS}\e[0m"
echo -e " \e[1;36mTotal Diagnostic Rows:\e[0m   \e[1;32m${DIAGS}\e[0m"
echo -e "\e[90m=====================================================\e[0m"

echo -e "\e[33m💡 PROOF:\e[0m Even though the poller runs every 10 seconds,"
echo -e "          the Diagnostic Rows will remain at \e[1;32m${DIAGS}\e[0m until"
echo -e "          a device physically changes state (goes offline).\n"

echo -e "\e[1;34m📋 RAW DATA: DEVICES TABLE\e[0m"
echo -e "\e[36m" # Set color to Cyan for the table
podman exec -i unifi-db psql -U poc -d poc -c "SELECT name, address, protocol, status, consecutive_failures FROM devices;"
echo -e "\e[0m" # Reset color

echo -e "\e[1;34m📈 RAW DATA: DIAGNOSTICS TABLE (Timeline)\e[0m"
echo -e "\e[36m" # Set color to Cyan for the table
podman exec -i unifi-db psql -U poc -d poc -c "
  SELECT
    dev.name AS device_name,
    diag.reachable,
    COALESCE(diag.device_reported_status, 'N/A (unreachable)') AS reported_status,
    diag.recorded_at
  FROM diagnostics diag
  JOIN devices dev ON diag.device_id = dev.id
  ORDER BY diag.recorded_at ASC;
"
echo -e "\e[0m" # Reset color
