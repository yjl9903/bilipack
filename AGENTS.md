# Repository Guidelines

## Project Structure & Module Organization

This pnpm/Turborepo workspace contains a TypeScript library and a Vue userscript.

- `packages/bilipack/src/`: TOML parsing, diagnostics, paths, and SRT; public exports in `index.ts`.
- `apps/monkey/src/`: `application/` coordinates imports and runs; `input/` prepares files; `workflow/` plans and verifies through `port.ts`; `bilibili/` implements the platform adapter.
- `packages/bilipack/test/` and `apps/monkey/test/`: local tests and helpers.
- `docs/intent/`, `docs/architecture/`, `docs/plan/`, and `docs/reference/`: user intent, architecture contracts, implementation plans, and upstream evidence.
- Native upload entry: `apps/monkey/src/entry/`; independent Vue panel: `apps/monkey/src/panel/`, assembled separately by `src/main.ts`.
- UI styles live with their entry or panel; generated bundles: workspace `dist/` directories.

## Documentation-First Workflow

Read [user intent](docs/intent/README.md), [architecture contracts](docs/architecture/README.md), implementation, and tests before changing behavior. Use [plans](docs/plan/monkey.md) for implementation proposals and [references](docs/reference/README.md) for upstream evidence. Never rewrite requirements to justify existing code or treat platform observations as requirements.

Follow the [development workflow](docs/documentation.md). Architecture explains responsibilities, core flows, and data relationships; keep file-level implementation details in plans. Keep affected layers aligned and distinguish design, implementation, and verification.

## Build, Test, and Development Commands

Use Node.js 24 or newer and the package-manager version declared in `package.json` (`pnpm@12.8.1`).

- `pnpm install --frozen-lockfile`: install the locked workspace dependencies.
- `pnpm build`: build the library and userscript, including userscript metadata checks.
- `pnpm dev`: start workspace development tasks.
- `pnpm exec turbo run dev --filter=@bilipack/monkey`: develop the userscript with its library dependency.
- `pnpm typecheck`: run TypeScript and Vue type checks.
- `pnpm test:ci`: run all tests once, with prerequisite builds and type checks.
- `pnpm --filter bilipack test`: watch library tests.
- `pnpm format`: format TypeScript and JavaScript files with Prettier.

## Coding Style & Naming Conventions

Follow the [code style guide](docs/code-style.md): strict TypeScript, ESM, two-space indentation, semicolons, single quotes, no trailing commas, and Prettier's 100-column width. Root formatting excludes Vue and CSS. Keep platform interactions behind page adapters.

## Testing Guidelines

Follow the [testing guide](docs/testing.md). Use Vitest with `*.test.ts` files in workspace `test/` directories; userscript tests use jsdom. Mock page adapters; do not add automated tests or HTML fixtures tied to unstable Bilibili DOM structures. Record manual platform validation separately. No numeric coverage threshold is configured.

## Commit & Pull Request Guidelines

Follow existing Conventional Commits (`docs:`, `chore:`); use `feat:` and `fix:` for functionality and corrections. Keep commits focused. PRs explain behavior changes, link issues, report validation, and include UI screenshots. Distinguish local tests from real-page verification.

## Interaction Boundaries

Keep final submission, draft saving, and saving published edits under user control. Preserve explicit configuration values and skip unsupported fields visibly. Update reference documentation when platform behavior changes.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
