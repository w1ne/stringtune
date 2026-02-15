# Contributing to StringTune

Thank you for your interest in contributing! We follow a structured workflow to ensure high quality and consistency.

## Getting Started

1. **Clone the repository**:

    ```bash
    git clone https://github.com/w1ne/stringtune.git
    cd stringtune
    ```

2. **Install dependencies**:

    ```bash
    npm install
    ```

    This will also install Git hooks via Husky.

## Development Workflow

We follow **Gitflow**:
- **`master`**: Production-ready code. Protected branch.
- **`develop`**: Integration branch for features.
- **`feature/*`**: Create a new branch for each feature (e.g., `feature/new-post`).

### Making Changes
1. Create a feature branch from `develop`:

    ```bash
    git checkout develop
    git checkout -b feature/my-cool-feature
    ```

2. Make your changes.
3. Run linting locally:

    ```bash
    npm run lint
    ```

### Commit Messages
We use **Conventional Commits**. Your commit message must follow this format:

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types**:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools and libraries such as documentation generation

**Example**:

```bash
git commit -m "feat: setup git hooks"
```

The `commit-msg` hook will verify your message format.

## Quality Gates

We use automated checks to ensure quality:
- **Lint-staged**: Checks files you are about to commit.
- **Markdownlint**: Checks for markdown style issues.
- **Lighthouse CI**: Checks for Performance, Accessibility, Best Practices, and SEO (in CI).
- **pa11y-ci**: Dedicated accessibility checks (in CI).

## Release Process

1. Merge feature branches into `develop`.
2. Release candidates are created from `develop` and merged into `master`.
