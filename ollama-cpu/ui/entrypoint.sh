#!/bin/sh
# Bypass Envoy outbound proxy for Ollama service (port 11434)
# so curl calls to ollama-cpu-svc reach Ollama directly.
iptables-legacy -t nat -I OUTPUT -p tcp --dport 11434 -j RETURN 2>/dev/null || \
  iptables -t nat -I OUTPUT -p tcp --dport 11434 -j RETURN 2>/dev/null || true

exec node dist/server/index.js
