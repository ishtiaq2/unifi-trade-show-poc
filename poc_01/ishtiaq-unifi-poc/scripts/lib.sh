#!/usr/bin/env bash
# scripts/lib.sh — sourced by the other scripts in this directory, not
# run directly. Colored step output, plus one real utility: a
# retry-until-ready loop.
#
# Why this exists rather than `sleep N` everywhere: a fixed sleep is
# either too short under load (a false failure on a slow machine or CI
# runner) or too long on a fast one (wasted time on every single run).
# The original verify-clean-slate.sh used a real retry loop for
# Postgres and the devices, but a fixed `sleep 5` for the monitoring
# service specifically — the one difference was never intentional, and
# it's the more fragile of the two approaches. Every wait in these
# scripts now goes through the same retry loop.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

step()    { echo -e "\n${BLUE}==> $1${NC}"; }
info()    { echo -e "${YELLOW}    $1${NC}"; }
success() { echo -e "${GREEN}    \xe2\x9c\x94 $1${NC}"; }
fail()    { echo -e "${RED}    \xe2\x9c\x96 $1${NC}"; exit 1; }

# wait_for <description> <max_attempts> <sleep_seconds> <check_command...>
#
# Retries <check_command> until it exits 0, or gives up after
# <max_attempts>. Returns non-zero on timeout — it does NOT exit the
# script itself. Called as a bare statement under `set -e`, that
# non-zero return still stops the script immediately (the normal case:
# one fatal check, no point continuing). Called inside an `if`, the
# caller can catch it and keep going — e.g. checking 4 devices and
# reporting all 4 results instead of stopping at the first failure.
#
#   wait_for "Postgres" 15 1 podman exec unifi-db pg_isready -U poc
#   if wait_for "device 1" 5 1 curl -sf http://localhost:4001/health; then ...
wait_for() {
  local desc="$1" max_attempts="$2" sleep_s="$3"
  shift 3
  local attempt=1
  while [ "$attempt" -le "$max_attempts" ]; do
    if "$@" >/dev/null 2>&1; then
      success "$desc ready (attempt $attempt/$max_attempts)"
      return 0
    fi
    sleep "$sleep_s"
    attempt=$((attempt + 1))
  done
  echo -e "${RED}    \xe2\x9c\x96 $desc did not become ready after $max_attempts attempts (${sleep_s}s apart)${NC}"
  return 1
}
