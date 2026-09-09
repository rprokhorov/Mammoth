#!/usr/bin/env bash
# Сборка приложения для macOS: ./build.sh
set -euo pipefail

trap 'printf "\nОшибка сборки (строка %s).\n" "$LINENO" >&2' ERR

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf 'Этот скрипт собирает .app для macOS. Для других ОС: npm ci && npm run tauri build\n' >&2
  exit 1
fi

for tool in node npm cargo rustc xcode-select; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Не найдена команда %s. Установите зависимости из BUILDING.md.\n' "$tool" >&2
    exit 1
  fi
done
xcode-select -p >/dev/null

printf 'Установка зависимостей из package-lock.json…\n'
npm ci --include=dev --no-audit --no-fund

# Фиксируем каталог и нативную платформу, чтобы путь результата был однозначным.
export CARGO_TARGET_DIR="$PROJECT_DIR/src-tauri/target/local-build"
export CARGO_BUILD_TARGET="$(rustc -vV | sed -n 's/^host: //p')"
APP_NAME="$(node -p "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json', 'utf8')).productName")"
APP_PATH="$CARGO_TARGET_DIR/$CARGO_BUILD_TARGET/release/bundle/macos/$APP_NAME.app"

printf '\nСборка %s…\n' "$APP_NAME"
npm run tauri -- build --target "$CARGO_BUILD_TARGET" --bundles app -- --locked

if [[ ! -d "$APP_PATH" ]]; then
  printf 'Сборка завершилась, но приложение не найдено: %s\n' "$APP_PATH" >&2
  exit 1
fi

printf '\nПриложение: %s\n' "$APP_PATH"
printf 'Запуск: open %q\n' "$APP_PATH"
