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
exec bash Installer
