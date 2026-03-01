# Contributing to Painless

Thank you for your interest in contributing to Painless!

## Development Workflow

### Prerequisites

- Node.js 18+
- pnpm 9+

### Setup

```bash
# Clone the repository
git clone https://github.com/wmzy/painless.git
cd painless

# Install dependencies
pnpm install

# Start development server
pnpm start
```

### Code Style

We use ESLint and Prettier for code formatting:

```bash
# Check for issues
pnpm lint

# Auto-fix issues
pnpm lint --fix
```

### Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

## Pull Request Guidelines

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'feat: add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style
- `refactor`: Code refactoring
- `test`: Testing
- `chore`: Maintenance

## Project Structure

```
painless/
├── src/
│   ├── components/     # React components
│   ├── views/          # Page components
│   ├── services/       # API & data fetching
│   ├── types/         # TypeScript types
│   └── index.tsx      # Entry point
├── public/             # Static assets
└── package.json
```

## Questions?

- Open an issue for bugs or feature requests
- Join our community for discussions
