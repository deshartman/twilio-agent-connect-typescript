# Development Guide

This document explains how to develop the Twilio Agent Connect and work with the monorepo structure.

## Monorepo Structure

```
twilio-agent-connect-typescript/
├── packages/                 # Framework packages
│   ├── core/                # @twilio/tac-core
│   ├── conversationrelay/   # @twilio/tac-conversationrelay
│   ├── tools/               # @twilio/tac-tools
│   └── server/              # @twilio/tac-server
├── getting_started/         # Getting started guide and examples
│   ├── README.md            # Step-by-step tutorial
│   └── examples/
│       ├── conversation/    # Conversation mode example (SMS + Voice)
│       ├── chat/            # Chat mode example
│       └── crelay/          # CRelay mode example
└── package.json             # Workspace root
```

## Local Development Workflow

### 1. Initial Setup

```bash
# Clone and install
git clone https://github.com/twilio-innovation/twilio-agent-connect-typescript.git
cd twilio-agent-connect-typescript
npm install
```

### 2. Making Changes to Framework

```bash
# Make your changes in packages/
vim packages/core/src/lib/tac.ts

# Build the packages
npm run build

# Test with examples (they automatically use your changes)
npm run example:getting-started
```

### 3. Dependency Management

#### Local Dependencies — today (`file:` protocol)

Examples use the `file:` protocol to reference the root package during development. `npm install` creates a symlink in `node_modules/` pointing to the repository root, so examples always consume the local build:

```json
// getting_started/examples/conversation/package.json + chat/package.json
{
  "dependencies": {
    "twilio-agent-connect": "file:../../.."
  }
}
```

The crelay example links directly to the CR package (since it doesn't need TAC):

```json
// getting_started/examples/crelay/package.json
{
  "dependencies": {
    "@twilio/tac-conversationrelay": "file:../../../packages/conversationrelay"
  }
}
```

This means:
- ✅ Examples always use your local build
- ✅ No need to publish during development
- ✅ Changes are reflected immediately after `npm run build`
- ✅ Version bumps don't break examples

#### Local Dependencies — after npm publish (`"*"` workspace pattern)

Once the packages are published to npm, switch to the npm workspaces `*` pattern (or pinned versions):

```json
{
  "dependencies": {
    "@twilio/tac-core": "*",
    "@twilio/tac-server": "*"
  }
}
```

The `*` resolves against the workspace declaration in the root `package.json`; workspace-local wins over the registry during development. This is the convention once the repo has `"workspaces": [...]` wired and packages are publishable. Keep the `file:` approach today because `twilio-agent-connect` is still a single published artifact (root `dist/`), not a set of per-package npm packages.

#### External Dependencies

External packages use normal semver:

```json
{
  "dependencies": {
    "openai": "^4.24.0",
    "dotenv": "^16.3.0"
  }
}
```

### 4. Development Commands

```bash
# Install dependencies for all packages
npm install

# Build all packages
npm run build

# Clean all build outputs
npm run clean

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check

# Testing
npm test
npm run test:coverage

# Run examples
npm run example:getting-started  # OpenAI example (SMS + Voice)
npm run example:chat             # Chat example
```

### 5. Adding New Packages

1. **Create package directory**:
   ```bash
   mkdir packages/my-new-package
   cd packages/my-new-package
   ```

2. **Create package.json** (matching repo convention — tsup, not raw tsc):
   ```json
   {
     "name": "@twilio/tac-my-new-package",
     "version": "1.0.0",
     "type": "module",
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "exports": {
       ".": {
         "types": "./dist/index.d.ts",
         "import": "./dist/index.js"
       }
     },
     "scripts": {
       "build": "tsup",
       "clean": "rimraf dist",
       "test": "vitest --run"
     },
     "dependencies": {
       "@twilio/tac-core": "*"
     }
   }
   ```

   > Note: today only `@twilio/tac-conversationrelay` has its own `package.json` + independent `dist/`. `core`, `server`, and `tools` are TypeScript-only workspaces bundled into the root `dist/` via the repo-level `tsup` config. If you're adding a package that should ship independently (like CR), follow the CR layout; if it should bundle into the root, skip the package.json and add to `src/index.ts` re-exports instead.

3. **Create tsconfig.json**:
   ```json
   {
     "extends": "../../tsconfig.json",
     "compilerOptions": {
       "outDir": "./dist",
       "rootDir": "./src"
     },
     "references": [
       { "path": "../core" }
     ]
   }
   ```

4. **Run from root to install**:
   ```bash
   cd ../../
   npm install
   ```

### 6. Adding New Examples

1. **Create example directory**:
   ```bash
   mkdir getting_started/examples/my-example
   cd getting_started/examples/my-example
   ```

2. **Create package.json with local dependencies**:
   
   **Current (Development in this repository)**:
   ```json
   {
     "name": "my-example",
     "private": true,
     "type": "module",
     "dependencies": {
       "twilio-agent-connect": "file:../../.."
     }
   }
   ```
   
   This uses the `file:` protocol to reference the root package during development. When you run `npm install`, it creates a symbolic link in `node_modules/` pointing to the repository root, allowing examples to use the local build.
   
   **Future (When published to NPM)**:
   ```json
   {
     "name": "my-example",
     "private": true,
     "type": "module",
     "dependencies": {
       "twilio-agent-connect": "^1.0.0"
     }
   }
   ```
   
   > **Note**: If using ConversationRelay directly (crelay mode without TAC), you may need to add `@twilio/tac-conversationrelay` as a separate dependency.

3. **Example automatically available**:
   ```bash
   cd ../../../
   npm install
   npm run build
   cd getting_started/examples/my-example
   npm run dev
   ```

## How Local Dependencies Work

### Today: `file:` protocol

When an example specifies `"twilio-agent-connect": "file:../../.."`:

1. **npm install** reads the `file:` path as a local link target
2. **Creates a symlink** at `node_modules/twilio-agent-connect` → repository root
3. **Your example** imports from the symlinked package, resolving to the root `dist/`

### Future: `*` workspace pattern (once packages are published)

When packages are npm-published and the repo declares `"workspaces": [...]`:

1. **npm install** looks for `@twilio/tac-core` in the declared workspaces
2. **Finds it** in `packages/core/`
3. **Symlinks** it to `node_modules/@twilio/tac-core` (workspace-local wins over registry)
4. **Your example** imports from the local, built package

### Development Flow

```bash
# 1. Make changes in packages/
vim packages/core/src/lib/tac.ts

# 2. Build (updates dist/)
npm run build

# 3. Examples automatically use the new build (via the symlink)
npm run example:getting-started
# or: npm run example:chat
```

### Why This Works

- **Symlinks**: npm creates symlinks from `examples/*/node_modules/twilio-agent-connect` → repository root (today), or from `node_modules/@twilio/*` → `packages/*/` (once publishable)
- **Built Code**: Examples import from `dist/` (built JavaScript)
- **Type Safety**: TypeScript references ensure proper type checking
- **Hot Reload**: Rebuild packages → restart examples → see changes

## TypeScript Project References

We use TypeScript project references for:
- **Fast builds**: Only rebuild changed packages
- **Type checking**: Cross-package type safety
- **IDE support**: Go-to-definition across packages

### Reference Structure

```
getting_started/examples/conversation → packages/server → packages/core
                                               ↘ packages/tools ↗
```

## Common Issues

### "Cannot find module '@twilio/tac-core'"

**Solution**: Build packages first
```bash
npm run build
```

### "Type errors in examples"

**Solution**: Ensure TypeScript references are correct
```bash
npm run typecheck
```

### "Changes not reflected in examples"

**Solution**: Rebuild and restart
```bash
npm run build
# Restart your example
```

### "Examples won't start"

**Solution**: Check workspace setup
```bash
# From root
npm install
npm run build

# Check symlinks exist
ls -la getting_started/examples/conversation/node_modules/@twilio/
```

## Best Practices

1. **Always build before testing examples**
2. **Use TypeScript references for cross-package dependencies**
3. **Keep examples simple and focused**
4. **Document environment variables in .env.example**
5. **Use `file:` for local dependencies today (`*` once the packages are npm-published), semver for external**
6. **Run linting and formatting before commits**
7. **Write tests for new features**

## Publishing (Future)

When ready to publish:

1. **Update versions** in package.json files
2. **Build all packages**: `npm run build`
3. **Run tests**: `npm test`
4. **Publish**: `npm publish --workspaces`

Examples will continue to work with published versions by changing `file:../../..` to actual version numbers (or `*` under a workspaces declaration).
