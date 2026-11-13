#!/bin/bash
# Runs every test and prints PASS / FAIL for each.   Usage:  bash tests/run_tests.sh [quick]
#   quick = skip the 16-minute computer-vs-computer game (the slowest test, ~3 min)
# Needs: python3, node, and Playwright for Python with a Chromium (pip install playwright && playwright install chromium).
# Starts a static server for the game on :8765 and the local multiplayer test server on :8790.
cd "$(dirname "$0")/.."
ROOT=$(pwd)

if ! curl -s -o /dev/null http://localhost:8765/index.html; then
  (cd "$ROOT" && setsid nohup python3 -m http.server 8765 >/tmp/aoe-http.log 2>&1 &) </dev/null >/dev/null 2>&1
fi
if ! curl -s -o /dev/null http://localhost:8790/index.html; then
  (cd "$ROOT/tests" && setsid nohup node mpserver.mjs 8790 >/tmp/aoe-mp.log 2>&1 &) </dev/null >/dev/null 2>&1
fi
sleep 1.5

fails=0
check() { # name, command, text that must appear in its output
  local name=$1 cmd=$2 want=$3
  local out
  out=$(cd "$ROOT/tests" && timeout 600 bash -c "$cmd" 2>&1 | grep -v "agent-proxy\|accounts.google\|Allowed domains\|For details")
  if echo "$out" | grep -q -- "$want" && ! echo "$out" | grep -q "Traceback\|errors \['"; then
    echo "PASS  $name"
  else
    echo "FAIL  $name"; echo "$out" | tail -8 | sed 's/^/      /'; fails=$((fails + 1))
  fi
}

check "room logic (lobby, seats, presets)"   "node test_room.mjs"        "all passed"
check "replay stays in sync"                 "python3 test_replay.py"   "replay True"
check "online 1v1 (lockstep, drop, rejoin)"  "python3 test_online.py"   "'desync': None"
check "freeplay milestones + replay"         "python3 test_freeplay.py" "'over': 'practice', 'desync': None"
check "bridges"                              "python3 test_bridge.py"   "'reachedB': True"
if [ "$1" != "quick" ]; then
  check "16-minute AI vs AI game"            "python3 test_ai_long.py"  "'min': 16"
fi

echo
if [ $fails = 0 ]; then echo "All tests passed."; else echo "$fails test(s) failed."; fi
exit $fails
