#!/usr/bin/env bash
set -euo pipefail

BASE="${RUSTIFY_BASE:-https://strangergithun.github.io}"
ARCHIVE="$BASE/downloads/rustify-src.tar.gz"
TMPDIR_RUSTIFY="$(mktemp -d "${TMPDIR:-/tmp}/rustify-install.XXXXXX")"

cleanup() {
    rm -rf "$TMPDIR_RUSTIFY"
}
trap cleanup EXIT INT TERM

say() { printf ':: %s\n' "$*"; }
die() { printf '!! %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] && die "Run this as your normal desktop user, not root. It uses sudo for system packages."

say "Downloading Rustify source..."
if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 --connect-timeout 15 --max-time 600 \
        -o "$TMPDIR_RUSTIFY/rustify-src.tar.gz" "$ARCHIVE" \
        || die "Download failed. Check your connection and try again."
elif command -v wget >/dev/null 2>&1; then
    wget -q -t 3 -T 15 -O "$TMPDIR_RUSTIFY/rustify-src.tar.gz" "$ARCHIVE" \
        || die "Download failed. Check your connection and try again."
else
    die "curl or wget is required to download Rustify."
fi

say "Extracting..."
tar -xzf "$TMPDIR_RUSTIFY/rustify-src.tar.gz" -C "$TMPDIR_RUSTIFY" \
    || die "Could not extract the archive."

cd "$TMPDIR_RUSTIFY/rustify-src" || die "Extracted source folder missing."
[ -f Installer ] || die "Installer script missing from the archive."
[ -f Cargo.toml ] || die "Cargo.toml missing from the archive."
[ -f src/main.rs ] || die "src/main.rs missing from the archive."

# The bundled binary is newer than the source so a clean machine installs in
# seconds. If it cannot run there, the Installer falls back to a source build.
[ -f bin/rustify ] && touch bin/rustify

say "Starting the installer. It will ask for your sudo password for system packages."
say "It installs GTK/WebKit runtime pieces, yt-dlp, Rustify, a desktop entry, and launches it."
echo

if ! bash Installer; then
    die "The installer did not finish. Scroll up for the first error."
fi

if { exec 3<>/dev/tty; } 2>/dev/null; then
    printf ':: Create a desktop shortcut? [y/N] ' >&3
    answer=""
    read -r answer <&3 || answer=""
    case "$answer" in
        y|Y|yes|YES|Yes)
            DESKTOP_DIR=""
            if command -v xdg-user-dir >/dev/null 2>&1; then
                DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || true)"
            fi
            case "$DESKTOP_DIR" in
                ""|"$HOME") DESKTOP_DIR="$HOME/Desktop" ;;
            esac
            mkdir -p "$DESKTOP_DIR"
            cat > "$DESKTOP_DIR/rustify.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Rustify
GenericName=Music Player
Comment=Native YouTube Music client
Exec="$HOME/.local/bin/rustify"
TryExec=$HOME/.local/bin/rustify
Icon=rustify
Terminal=false
Categories=AudioVideo;Audio;Player;
StartupNotify=true
StartupWMClass=rustify
EOF
            chmod +x "$DESKTOP_DIR/rustify.desktop"
            if command -v gio >/dev/null 2>&1; then
                gio set "$DESKTOP_DIR/rustify.desktop" metadata::trusted true >/dev/null 2>&1 || true
            fi
            printf ':: Desktop shortcut created at %s\n' "$DESKTOP_DIR/rustify.desktop" >&3
            exec 3>&-
            ;;
        *)
            printf ':: No desktop shortcut created.\n' >&3
            exec 3>&-
            ;;
    esac
else
    say "No terminal attached; skipping the desktop shortcut prompt."
fi
