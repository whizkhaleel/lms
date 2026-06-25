#!/usr/bin/env bash
set -euo pipefail

# Generate self-signed SSL certificates for development.
# In production, replace these with real certificates from a CA.

SSL_DIR="$(dirname "$0")/../nginx/ssl"
mkdir -p "$SSL_DIR"

# Generate a self-signed cert using openssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$SSL_DIR/server.key" \
  -out "$SSL_DIR/server.crt" \
  -subj "/C=NG/ST=Lagos/L=Lagos/O=LMS/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:*.lms.local"

echo "SSL certificates generated:"
echo "  $SSL_DIR/server.crt"
echo "  $SSL_DIR/server.key"
echo ""
echo "These are self-signed certificates for development only."
echo "Replace with CA-issued certificates for production."
