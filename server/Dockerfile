FROM node:22-bookworm-slim AS web-builder

WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile

ARG DBKANG_PUBLIC_BASE_URL=http://localhost:8000
ARG DBKANG_VERSION=0.1.0
ENV VITE_DBKANG_BASE_URL=${DBKANG_PUBLIC_BASE_URL} \
    VITE_DBKANG_TOOLBOX_URL=${DBKANG_PUBLIC_BASE_URL}/toolbox \
    DBKANG_VERSION=${DBKANG_VERSION}
RUN pnpm build

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS runtime

ARG DBKANG_VERSION=0.1.0

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_DEV=1 \
    DBKANG_APP_VERSION=${DBKANG_VERSION}

COPY server/pyproject.toml ./
RUN uv sync --no-dev

COPY server/alembic.ini ./
COPY server/migrations ./migrations
COPY server/app ./app
COPY server/assets ./assets
COPY --from=web-builder /src/apps/toolbox/dist ./static/toolbox
COPY --from=web-builder /src/apps/admin/dist ./static/admin
COPY --from=web-builder /src/apps/userscript/dist ./static/updates
COPY release/browser ./static/updates

RUN mkdir -p /app/data /app/assets /app/static/toolbox /app/static/admin /app/static/updates

EXPOSE 8000
CMD ["sh", "-c", "uv run alembic upgrade head && exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]

FROM runtime AS test
ENV UV_NO_DEV=false \
    PYTHONPATH=/app
RUN uv sync --all-groups
COPY server/tests ./tests
CMD ["uv", "run", "--all-groups", "pytest"]

FROM runtime AS production
