# Repository Guidelines

## Project Structure & Module Organization

Application code is split between `electron/` for the main process, preload bridge, IPC handlers, and local services, and `src/` for the React renderer. Product and technical documents live in `doc/`; automated tests belong in `tests/`, and reusable static files belong in `assets/`. Keep package entry points and project metadata at the repository root.

## Build, Test, and Development Commands

Run commands from the repository root. The current development workflow is:

- `npm.cmd install` installs JavaScript dependencies.
- `npm.cmd run dev` starts the Electron development application.
- `npm.cmd run lint` runs the TypeScript compiler without emitting files.
- `npm.cmd run build` builds the main process, preload script, and renderer.
- `npm.cmd test` runs Vitest when tests are present.

Keep new scripts documented here and in `package.json`.

## Coding Style & Naming Conventions

Use 2-space indentation for TypeScript and JSX. Prefer explicit interfaces for IPC payloads and shared data, small focused modules, and explicit error handling. Use `camelCase` for variables and functions, `PascalCase` for React components and types, and `UPPER_SNAKE_CASE` for constants. Keep renderer code free of direct Node.js access; add system operations to the main process and expose them through a narrow preload API.

## Testing Guidelines

Use Vitest for business logic and Testing Library for React components when tests are introduced. Place tests in `tests/`, name files `*.test.ts` or `*.test.tsx`, and describe behavior rather than implementation details. Cover normal behavior, boundary cases, IPC failures, and unreadable files. New behavior should include regression coverage; no coverage threshold is currently defined.

## Commit & Pull Request Guidelines

Git history is not available in this checkout, so use imperative, concise commit subjects such as `Add TXT reader` or `Fix PDF progress restore`. Keep commits focused. Pull requests should explain the behavior changed, include the commands run and their results, link related issues when applicable, and call out configuration or compatibility impacts. Include screenshots for user-facing interface changes.

## Security & Configuration

Do not commit secrets, credentials, generated virtual environments, caches, or local configuration. Use environment variables or an ignored `.env` file for sensitive settings, and provide a safe example configuration when needed.
