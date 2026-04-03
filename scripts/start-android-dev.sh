#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE_DIR="$ROOT_DIR/mobile"
ANDROID_DIR="$MOBILE_DIR/android"
SDK_DIR="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
ADB_BIN="$SDK_DIR/platform-tools/adb"
EMULATOR_BIN="$SDK_DIR/emulator/emulator"
JAVA_HOME_DEFAULT="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
APP_ID="com.quoteapp.mobile"
BOOT_TIMEOUT_SECONDS="${ANDROID_BOOT_TIMEOUT_SECONDS:-180}"

cd "$ROOT_DIR"

if [[ ! -d "$SDK_DIR" ]]; then
  echo "Android SDK not found at $SDK_DIR"
  exit 1
fi

if [[ ! -x "$ADB_BIN" ]]; then
  echo "adb not found at $ADB_BIN"
  exit 1
fi

if [[ ! -x "$EMULATOR_BIN" ]]; then
  echo "Android emulator binary not found at $EMULATOR_BIN"
  exit 1
fi

if [[ -z "${JAVA_HOME:-}" ]]; then
  if [[ -d "$JAVA_HOME_DEFAULT" ]]; then
    export JAVA_HOME="$JAVA_HOME_DEFAULT"
  else
    echo "JAVA_HOME is not set and Android Studio bundled JDK was not found."
    exit 1
  fi
fi

export ANDROID_HOME="$SDK_DIR"
export ANDROID_SDK_ROOT="$SDK_DIR"
export PATH="$JAVA_HOME/bin:$SDK_DIR/platform-tools:$SDK_DIR/emulator:$PATH"

wait_for_device() {
  local deadline=$((SECONDS + BOOT_TIMEOUT_SECONDS))

  while (( SECONDS < deadline )); do
    local device_line
    device_line="$($ADB_BIN devices | awk 'NR > 1 && $1 ~ /^emulator-/ { print $1 " " $2; exit }')"

    if [[ -n "$device_line" ]]; then
      local serial state
      serial="${device_line%% *}"
      state="${device_line##* }"

      if [[ "$state" == "offline" ]]; then
        "$ADB_BIN" reconnect offline >/dev/null 2>&1 || true
      fi

      if [[ "$state" == "device" ]]; then
        local boot_completed
        boot_completed="$($ADB_BIN -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
        if [[ "$boot_completed" == "1" ]]; then
          echo "$serial"
          return 0
        fi
      fi
    fi

    sleep 3
  done

  return 1
}

restart_emulator() {
  local avd_name="$1"
  shift || true

  for serial in $($ADB_BIN devices | awk 'NR > 1 && $1 ~ /^emulator-/ { print $1 }'); do
    "$ADB_BIN" -s "$serial" emu kill >/dev/null 2>&1 || true
  done

  pkill -f "$EMULATOR_BIN -avd $avd_name" >/dev/null 2>&1 || true
  pkill -f "qemu-system.*${avd_name}" >/dev/null 2>&1 || true

  sleep 5
  echo "Starting emulator: $avd_name"
  "$EMULATOR_BIN" -avd "$avd_name" "$@" >/tmp/quote-app-android-emulator.log 2>&1 &
}

mkdir -p "$ANDROID_DIR"
printf 'sdk.dir=%s\n' "$SDK_DIR" > "$ANDROID_DIR/local.properties"

if [[ ! -f "$ROOT_DIR/web/.env.local" ]]; then
  echo "Warning: missing $ROOT_DIR/web/.env.local. Web/API features may fail until you create it."
fi

if [[ ! -f "$MOBILE_DIR/.env" ]]; then
  echo "Warning: missing $MOBILE_DIR/.env. Mobile app may not connect to Supabase."
fi

avd_name="${ANDROID_AVD_NAME:-$($EMULATOR_BIN -list-avds | head -n 1)}"
if [[ -z "$avd_name" ]]; then
  echo "No Android AVD found. Create one in Android Studio Device Manager first."
  exit 1
fi

running_device="$($ADB_BIN devices | awk 'NR > 1 && $2 == "device" && $1 ~ /^emulator-/ { print $1; exit }')"
if [[ -z "$running_device" ]]; then
  restart_emulator "$avd_name"
  if ! running_device="$(wait_for_device)"; then
    echo "Emulator did not become ready within ${BOOT_TIMEOUT_SECONDS}s. Retrying with a cold boot."
    "$ADB_BIN" kill-server >/dev/null 2>&1 || true
    "$ADB_BIN" start-server >/dev/null 2>&1 || true
    restart_emulator "$avd_name" -no-snapshot-load

    if ! running_device="$(wait_for_device)"; then
      echo "Android emulator is still offline. Check the emulator window or /tmp/quote-app-android-emulator.log"
      exit 1
    fi
  fi
fi

if ! "$ADB_BIN" shell pm list packages | grep -q "$APP_ID"; then
  echo "Installing Android development build..."
  (cd "$ANDROID_DIR" && ./gradlew app:installDebug)
fi

if [[ "${START_WEB:-0}" == "1" ]]; then
  if lsof -tiTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Web dev server already running on port 3000; skipping web startup."
  else
    echo "Starting web dev server..."
    npm --prefix "$ROOT_DIR/web" run dev >/tmp/quote-app-web.log 2>&1 &
  fi
fi

echo "Starting Expo Android app..."
exec npm --prefix "$MOBILE_DIR" run android