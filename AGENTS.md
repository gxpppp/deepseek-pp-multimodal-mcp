# Repository Guidelines

## Project Structure & Module Organization

This package is a Node.js ESM Native Messaging MCP host for DeepSeek++ multimodal tools.

- `bin/deepseek-pp-multimodal-mcp.mjs` is the CLI entry point used for local installs.
- `lib/server.mjs` contains MCP JSON-RPC handling, tool definitions, validation, and provider calls.
- `lib/installer.mjs` writes browser Native Messaging host manifests.
- `native/multimodal-mcp-host.mjs` is the browser-facing native host process.
- `test/*.test.mjs` contains Node test-runner coverage. There is no separate assets directory.
- `README.md` documents usage and environment variables.

## Build, Test, and Development Commands

- `npm test` runs the full `node --test` suite.
- `npm run smoke:native` runs the native-host smoke test file directly.
- `node bin/deepseek-pp-multimodal-mcp.mjs install --browser chrome --extension-id <extension-id>` installs this checkout as a Chrome native host.
- `npx deepseek-pp-multimodal-mcp install --browser chrome --extension-id <extension-id>` installs the published package.

There is no compile step; files run directly on Node `>=18.17`.

## Coding Style & Naming Conventions

Use ESM `.mjs`, 2-space indentation, semicolons, and named exports for shared functions/constants. Keep protocol/default values as uppercase constants, JavaScript functions in `camelCase`, and MCP tool names in stable `snake_case`.

Prefer small validation helpers and explicit error objects over broad `try/catch` fallbacks. Provider failures, missing keys, inaccessible media, and invalid inputs should surface as clear MCP errors.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`. Name tests by observable behavior, for example `fails image calls clearly when OpenAI key is missing`. Cover JSON-RPC responses, native framing, validation boundaries, environment handling, and provider URLs.

When stubbing `globalThis.fetch`, restore it in `finally`. Avoid real provider calls in default tests; use explicit opt-in scripts or manual checks for live OpenAI/Gemini validation.

## Commit & Pull Request Guidelines

This checkout does not include Git history, so use a simple imperative convention: `server: reject ambiguous video sources`, `installer: add firefox manifest path`, or `test: cover custom Gemini base URL`.

Pull requests should include: a behavior summary, affected MCP tools or native-host paths, new or changed environment variables, linked issues, and validation commands run. For browser integration changes, include the extension ID/browser and relevant native-host logs.

## Security & Configuration Tips

Never commit API keys. Use `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENAI_IMAGE_MODEL`, `GEMINI_VIDEO_MODEL`, `OPENAI_BASE_URL`, and `GEMINI_BASE_URL` through the DeepSeek++ MCP preset `Env` field or host process environment. Be conservative with `localPath` handling and native message size limits; changes there affect local file access and browser-host stability.
