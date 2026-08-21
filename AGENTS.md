# Repository Guidelines

## Project Structure & Module Organization

Applications live under `apps/`: `toolbox` is the Vue student UI, `admin` is the administration UI, `userscript` bridges Chaoxing pages, and `browser` builds portable Windows Chromium. Reusable code lives in `packages/`: `chaoxing` parses page DOM, `shared` holds cross-app types and utilities, and `ui` provides shared styles. The FastAPI service, Alembic migrations, SQLite integration, and Python tests are under `server/`. Product decisions belong in `docs/`; release artifacts are generated under `release/` and should not be hand-edited.

## Build, Test, and Development Commands

- `pnpm install` installs Node workspace dependencies; `uv sync --project server --all-groups` installs Python dependencies.
- `pnpm dev` builds the frontends, applies migrations, and starts the unified service at `http://localhost:8000`.
- `pnpm dev:hmr` runs Vite watchers for the student, admin, and userscript apps.
- `pnpm check` runs all TypeScript checks, Vitest suites, and production builds.
- `pnpm server:test` runs the pytest backend suite.
- `uv run --project server ruff check server/app server/tests server/migrations` applies Python lint checks.
- `pnpm --filter @dbkang/userscript build` creates `apps/userscript/dist/DBKangToolbox.user.js`.

## Coding Style & Naming Conventions

Use two-space indentation in TypeScript, Vue, JSON, and YAML; use four spaces in Python. Prefer TypeScript strict types, Vue Composition API, and small pure parsers for external DOM. Use `camelCase` for variables/functions, `PascalCase` for types and Vue components, and `snake_case` for Python. Ruff enforces Python style (100-character lines); `vue-tsc` and `tsc` enforce frontend types.

## Testing Guidelines

Vitest tests use `*.test.ts` beside their source; pytest files use `server/tests/test_*.py`. Add fixtures based on sanitized real Chaoxing DOM when changing parsers. No numeric coverage threshold is configured, but every bug fix should include a regression test. Run `pnpm check` and the Ruff/pytest commands before submitting.

## Commit & Pull Request Guidelines

History is minimal but includes Conventional Commit syntax (`fix(scope): summary`); continue with concise imperative messages such as `feat(userscript): sync homework scores`. Pull requests should explain behavior and risk, link relevant issues, list verification commands, and include screenshots for visible UI changes. Call out schema migrations, configuration changes, and generated Windows artifacts explicitly.

After every completed modification, increment the patch version by one unless the user requests another versioning scheme. Then commit all task-related changes and immediately push the current branch to its configured remote; do not leave completed work only in the working tree.

## Security & Domain Rules

Never commit credentials, cookies, student PII, `.env`, databases, or `user-data/`. Do not invent unstable Chaoxing endpoints; derive adapters from authorized Network/DOM evidence and sanitize fixtures. Treat `courseId` and `classId` (`clazzid`) as identities; course and class names are display-only. Keep student, admin, API, and update endpoints on the unified deployment origin.
