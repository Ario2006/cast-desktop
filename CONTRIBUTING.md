# Contributing to Cast

Thank you for your interest in contributing to Cast! We welcome contributions, bug reports, and suggestions from everyone.

## Getting Started

### Prerequisites

- **macOS** (Apple Silicon or Intel)
- **Node.js 20.19+** (22+ recommended)
- **npm 10+**

### Setting Up Development Environment

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/<your-username>/cast-desktop.git
   cd cast-desktop
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run Cast in development mode:
   ```bash
   npm run dev
   ```
   The `C` icon will appear in your macOS menu bar. Press `⌥ Space` to open Cast.

## Project Structure

- `src/main`: Electron main process (tray, window management, system bridges, scheduler, SQLite stores, local & AI services).
- `src/preload`: Context-isolated Electron preload scripts.
- `src/renderer`: React 19 UI (launcher input, suggestion list, settings, widgets).
- `src/shared`: Core business logic, intent parsing, action registries, and utility functions (shared across main and renderer).
- `tests/`: Unit and integration test suites using Vitest.

## Testing & Quality

Before submitting a pull request, ensure tests pass and code style matches:

```bash
# Run unit tests
npm test

# Run linter
npm run lint

# Format code
npm run format
```

## Creating a Pull Request

1. Create a descriptive branch: `git checkout -b feature/my-new-action`
2. Commit your changes: `git commit -m "feat: add currency converter rounding options"`
3. Push to your fork: `git push origin feature/my-new-action`
4. Open a Pull Request against `main`.

## License

By contributing to Cast, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
