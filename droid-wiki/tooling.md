# Tooling

Agent Maintainer Bridge is a Node.js TypeScript project. It requires Node 20 or
newer and uses npm.

## Scripts

From `package.json`:

```bash
npm start
npm run dev
npm run typecheck
npm test
```

- `npm start` runs `src/index.ts` through the `tsx` ESM loader.
- `npm run dev` watches the same entrypoint.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm test` runs the Vitest suite.

There is no `.github/workflows/` directory in this checkout.

## Launchd

`com.example.voice-to-claude.plist` is a template for running the bridge under
launchd. It intentionally uses placeholder values for tokens, paths, channel
IDs, user IDs, and repo aliases. Real values belong in local launchd
environment variables or another local secret mechanism, not in committed docs.

The relay listens on localhost only. Do not change the bind address without a
separate security review.

## Validation

For code changes, use:

```bash
npm run typecheck
npm test
```

For docs-only installed-wiki refreshes, at minimum run:

```bash
git diff --check
```

Because this wiki pass is documentation-only, runtime scripts do not need to be
executed unless the implementation changes.
