## ishtiaq-unifi-poc/docs/step-1-to-5/verify-step5.sh
### Run it from monitoring-service/

#!/usr/bin/env bash
#
# Verifies step 5 (DeviceClient) is genuinely present AND wired in —
# not just that the files exist. File existence and actual wiring are
# two different failure modes: it's possible to copy clients/ in
# without ever calling discoverProtocol from registerDevice, and the
# app still runs fine (it just never resolves protocol).
#
# Run from monitoring-service/:
#   ./verify-step5.sh

set -uo pipefail

REST_DIR="${REST_DIR:-rest}"
SRC="$REST_DIR/src"

pass=0
fail=0
ok()  { echo "  PASS  $1"; pass=$((pass+1)); }
bad() { echo "  FAIL  $1"; fail=$((fail+1)); }

echo "=== Files ==="

check_file() {
  if [ -f "$1" ]; then ok "$1 exists"; else bad "$1 MISSING"; fi
}

check_file "$SRC/clients/DeviceClient.ts"
check_file "$SRC/clients/RestDeviceClient.ts"
check_file "$SRC/clients/clientFactory.ts"
check_file "$SRC/service/monitoringService.ts"

echo
echo "=== DeviceClient.ts: the interface itself ==="
DC="$SRC/clients/DeviceClient.ts"
if [ -f "$DC" ]; then
  grep -q "discoverCapabilities" "$DC" && ok "declares discoverCapabilities(...)" || bad "no discoverCapabilities method found"
  grep -q "checkHealth" "$DC" && ok "declares checkHealth(...)" || bad "no checkHealth method found"
else
  bad "cannot check — file missing"
fi

echo
echo "=== RestDeviceClient.ts: real implementation, not a stub ==="
RC="$SRC/clients/RestDeviceClient.ts"
if [ -f "$RC" ]; then
  grep -qE "fetch\(|http\.request|axios" "$RC" && ok "makes a real network call" || bad "no fetch/http call found — is this still a stub?"
  grep -q "/health" "$RC" && ok "calls the device's /health endpoint" || bad "no /health call found"
  grep -q "/diagnostics" "$RC" && ok "calls the device's /diagnostics endpoint" || bad "no /diagnostics call found"
else
  bad "cannot check — file missing"
fi

echo
echo "=== THE PART THAT'S EASY TO MISS: is it actually called? ==="
MS="$SRC/service/monitoringService.ts"
if [ -f "$MS" ]; then
  grep -qE "discoverProtocol|DeviceClient" "$MS" \
    && ok "monitoringService.ts references the device client / discovery" \
    || bad "monitoringService.ts NEVER MENTIONS discovery — the files exist but nothing calls them"

  # The specific thing that matters: is discovery called INSIDE registerDevice,
  # not just imported and unused (which would typecheck fine and do nothing).
  awk '/async registerDevice/,/^  }/' "$MS" > /tmp/_registerDevice_body.txt 2>/dev/null
  if grep -q "discoverProtocol" /tmp/_registerDevice_body.txt 2>/dev/null; then
    ok "discoverProtocol is called INSIDE registerDevice (not just imported)"
  else
    bad "discoverProtocol is not called inside registerDevice — import without use"
  fi
else
  bad "cannot check — monitoringService.ts missing"
fi

echo
echo "=== Architecture shape (not just presence) ==="

# The interface should not import the concrete implementation — that
# would be backwards (implementations depend on interfaces, not the
# reverse). Checked as an actual `import` line, not just any mention of
# the name — a doc comment explaining "the REST implementation exists"
# would otherwise cause a false failure here.
if [ -f "$DC" ] && grep -qE "^\s*import.*RestDeviceClient" "$DC"; then
  bad "DeviceClient.ts imports RestDeviceClient — interface should not know about its implementation"
else
  ok "DeviceClient.ts does not import RestDeviceClient (correct direction)"
fi

# The HTTP layer should talk to the service layer, not the device
# client directly — otherwise the HTTP layer starts doing the service
# layer's job.
HTTP="$SRC/http/app.ts"
if [ -f "$HTTP" ]; then
  if grep -qE "RestDeviceClient|discoverProtocol|clientFactory" "$HTTP"; then
    bad "http/app.ts references the device client directly — should only call the service layer"
  else
    ok "http/app.ts does not bypass the service layer to reach the device client"
  fi
fi

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ] || exit 1
