#!/bin/sh
# Bypass Olares Envoy sidecar for port 3001 (chart server)
# so app-service can download charts without JWT auth
# Olares' sidecar-init uses iptables-legacy; Alpine's default
# `iptables` may point to iptables-nft (a separate backend).
# We must insert our RETURN rule into the legacy backend so it
# takes effect before the PROXY_INBOUND redirect.
iptables-legacy -t nat -I PREROUTING -p tcp --dport 3001 -j RETURN 2>/dev/null || \
  iptables -t nat -I PREROUTING -p tcp --dport 3001 -j RETURN 2>/dev/null || true

# Bypass Envoy outbound proxy for OpenClaw (port 18789)
# so wget/curl calls to OpenClaw /api/config carry the Bearer token
# without Envoy stripping or modifying the Authorization header.
iptables-legacy -t nat -I OUTPUT -p tcp --dport 18789 -j RETURN 2>/dev/null || \
  iptables -t nat -I OUTPUT -p tcp --dport 18789 -j RETURN 2>/dev/null || true

exec node dist/server/index.js
