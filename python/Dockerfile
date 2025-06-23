FROM python:3.11-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

COPY src .
COPY CONFIG-EXAMPLE.yaml /app/CONFIG.yaml

RUN uv sync
CMD ["uv", "run", "simwrapper", "run", "CONFIG.yaml"]
