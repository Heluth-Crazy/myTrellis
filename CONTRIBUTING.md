# Contributing to Trellis Lite

Trellis Lite is a private, npm-based Node.js package. The CLI supports Node.js 18 or newer and has no runtime dependencies. Use Node.js 22 for development (the test runner requires Node.js 20 or newer); development dependencies are TypeScript, Vitest, and `@types/node`.

## Development

```bash
npm ci
npm run build
npm test
```

Run the local CLI as `node bin/trellis.js`. Do not use `npm link` or install the package globally. Keep changes focused, preserve the wording in `templates/`, and add tests for command behavior that changes.

## Pull requests

Explain the user-visible behavior and include the checks you ran. Keep generated files and temporary test directories out of the repository. CI runs the build and test suite on Ubuntu and Windows with Node.js 22.
