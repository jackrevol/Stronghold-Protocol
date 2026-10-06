#!/usr/bin/env bash
# macOS / Linux: clean generated output, rebuild, and start the game server.
# Usage: ./start.sh   or   PORT=3001 HOST=127.0.0.1 ./start.sh
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "사용법: ./start.sh"
  echo "포트/주소 지정: PORT=3001 HOST=127.0.0.1 ./start.sh"
  echo "기존 빌드 정리 → npm ci → 새 빌드 → 서버 실행 (기본 포트: 3000)"
  exit 0
fi
if [[ $# -ne 0 ]]; then
  echo "지원하지 않는 인자입니다. ./start.sh --help를 확인하세요." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 22 이상과 npm이 필요합니다." >&2
  exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  echo "Node.js $(node -v)는 지원하지 않습니다. Node.js 22 이상을 사용하세요." >&2
  exit 1
fi

echo "[1/4] 기존 빌드 정리"
rm -rf -- "$PROJECT_ROOT/dist" "$PROJECT_ROOT/public/vendor"

echo "[2/4] 잠금 파일 기준 의존성 설치"
npm ci --no-audit --no-fund

echo "[3/4] 새 빌드 생성"
npm run build:vercel

echo "[4/4] 서버 실행 — http://localhost:${PORT:-3000} (종료: Ctrl+C)"
exec node "$PROJECT_ROOT/server/index.js"
