#!/bin/sh
# ScanSplit installer for macOS and Linux.
# Usage: curl -fsSL https://7174andy.github.io/scansplit/install.sh | sh
set -e

REPO="7174Andy/scansplit"
API_URL="https://api.github.com/repos/$REPO/releases/latest"

printf 'Installing ScanSplit…\n'

case "$(uname -s)" in
  Darwin) OS=macos ;;
  Linux)  OS=linux ;;
  *) printf 'Unsupported OS: %s\n' "$(uname -s)" >&2; exit 1 ;;
esac

if [ "$OS" = macos ]; then
  # One universal DMG covers both Apple Silicon and Intel.
  PATTERN='_universal\.dmg$'
else
  case "$(uname -m)" in
    x86_64|amd64) ;;
    *) printf 'Linux builds are x86_64 only (detected %s).\n' "$(uname -m)" >&2; exit 1 ;;
  esac
  if [ -r /etc/os-release ] && grep -qE '^ID(_LIKE)?=.*(debian|ubuntu)' /etc/os-release; then
    PATTERN='_amd64\.deb$'
    LINUX_FORMAT=deb
  else
    PATTERN='_amd64\.AppImage$'
    LINUX_FORMAT=appimage
  fi
fi

ASSET_URL=$(curl -fsSL "$API_URL" \
  | grep '"browser_download_url"' \
  | cut -d '"' -f 4 \
  | grep -E "$PATTERN" \
  | head -1)

if [ -z "$ASSET_URL" ]; then
  printf 'No matching asset (pattern: %s). Is a release published yet?\n' "$PATTERN" >&2
  exit 1
fi

TMP=$(mktemp -d)
FILE="$TMP/$(basename "$ASSET_URL")"
printf 'Downloading %s…\n' "$(basename "$ASSET_URL")"
curl -fL --progress-bar "$ASSET_URL" -o "$FILE"

if [ "$OS" = macos ]; then
  printf 'Mounting disk image…\n'
  MOUNT=$(hdiutil attach -nobrowse "$FILE" | awk '/\/Volumes\// {print $NF; exit}')
  if [ -z "$MOUNT" ]; then
    printf 'Could not determine mount point.\n' >&2
    exit 1
  fi
  if [ -d /Applications/ScanSplit.app ]; then
    printf 'Removing existing ScanSplit.app…\n'
    rm -rf /Applications/ScanSplit.app
  fi
  cp -R "$MOUNT/ScanSplit.app" /Applications/
  hdiutil detach -quiet "$MOUNT"
  printf 'Removing quarantine attribute (app is unsigned)…\n'
  xattr -dr com.apple.quarantine /Applications/ScanSplit.app
  printf 'ScanSplit installed. Launch it from Applications.\n'
elif [ "$LINUX_FORMAT" = deb ]; then
  printf 'Installing .deb (sudo required)…\n'
  sudo dpkg -i "$FILE" || sudo apt-get -f install -y
  printf 'ScanSplit installed. Launch it from your application menu.\n'
else
  DEST="$HOME/.local/bin/scansplit"
  mkdir -p "$HOME/.local/bin"
  install -m 755 "$FILE" "$DEST"
  printf 'ScanSplit installed to %s\n' "$DEST"
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) printf 'Note: add %s to your PATH to launch from anywhere.\n' "$HOME/.local/bin" ;;
  esac
fi
