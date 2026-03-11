# Lightweight LiteLLM proxy image (~400-500MB vs official ~1.5GB)
# Only includes proxy + complexity router, no UI/DB/enterprise features.
FROM python:3.11-slim

RUN pip install --no-cache-dir 'litellm[proxy]==1.81.14'

# Patch complexity_router to handle array content blocks and fallback to default model
COPY complexity_router.py /usr/local/lib/python3.11/site-packages/litellm/router_strategy/complexity_router/complexity_router.py

EXPOSE 4000

ENTRYPOINT ["litellm"]
CMD ["--config", "/etc/litellm/config.yaml", "--port", "4000"]
