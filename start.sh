#!/bin/sh
# 나만의 영어회화 단어장 — 로컬 실행
DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=4321
echo "→ http://localhost:$PORT  (종료: Ctrl+C)"
command -v open >/dev/null 2>&1 && (sleep 1; open "http://localhost:$PORT") &
exec python3 -m http.server "$PORT" --directory "$DIR"
