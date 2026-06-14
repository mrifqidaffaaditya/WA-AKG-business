# Contributing to WA-AKG Business

First off, thank you for considering contributing to WA-AKG Business! 🎉

This document provides guidelines for contributing to the project. Following these guidelines helps maintain code quality and makes the review process smoother.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Conventions](#coding-conventions)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Documentation](#documentation)

---

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

---

## How Can I Contribute?

### 🐛 Reporting Bugs

1. **Search existing issues** to avoid duplicates.
2. Use the **Bug Report template** when opening an issue.
3. Include:
   - Clear description and steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, browser)
   - Screenshots if applicable

### 💡 Suggesting Features

1. **Search existing issues** — someone might have already proposed it.
2. Use the **Feature Request template**.
3. Explain the problem it solves and the use case.

### 🔧 Code Contributions

Areas where we especially welcome contributions:

- **Frontend UI polish** — animations, dark mode, responsive improvements
- **Mobile PWA** — offline support, install prompts
- **Testing** — unit tests, integration tests, E2E tests
- **Performance** — query optimization, caching strategies
- **i18n** — translations for additional languages
- **Docs** — tutorials, setup videos, troubleshooting guides

---

## Development Setup

### Prerequisites

- Node.js ≥ 20
- npm ≥ 10

### Getting Started

```bash
# Clone and install
git clone https://github.com/your-org/wa-akg-business.git
cd wa-akg-business

# Backend
cd backend
npm install
cp .env.example .env
npx drizzle-kit push
npm run dev        # http://localhost:4040

# Frontend
cd ../frontend
npm install
npm run dev        # http://localhost:4041
```

### Type Checking

```bash
# Backend
cd backend && npx tsc --noEmit

# Frontend
cd frontend && npm run build
```

---

## Project Structure

```
wa-akg-business/
├── backend/
│   ├── src/
│   │   ├── db/              # Drizzle ORM schema & connection
│   │   ├── services/        # Business logic
│   │   │   ├── auth.ts      # Authentication (JWT, bcrypt)
│   │   │   ├── chatbot.ts   # AI chatbot
│   │   │   ├── conversation.ts  # Conversation CRUD + pagination
│   │   │   ├── customer.ts  # Returning customer logic
│   │   │   ├── notifications.ts # Web Push
│   │   │   ├── orchestrator.ts  # Message routing (bot → queue → CS)
│   │   │   ├── stock.ts     # Google Sheets / DB stock
│   │   │   └── waGateway.ts # Baileys WA Gateway
│   │   ├── routes/          # Express route handlers
│   │   ├── middleware/       # Auth & rate limiting middleware
│   │   ├── ws/              # Socket.io setup & helpers
│   │   └── utils/           # Shared utilities
│   ├── .env                 # Environment variables
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js App Router pages
│   │   │   ├── login/       # Login page
│   │   │   ├── cs/          # CS Dashboard
│   │   │   └── admin/       # Admin Panel
│   │   ├── components/      # Shared React components
│   │   ├── hooks/           # Custom React hooks
│   │   └── lib/             # API client, Socket.io, Push
│   ├── public/
│   │   └── sw.js            # Service Worker for push notifications
│   └── package.json
├── docs/                    # Documentation
├── docker-compose.yml       # Docker deployment
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
└── LICENSE
```

---

## Coding Conventions

### TypeScript

- Use **explicit types** for function parameters and return values
- Avoid `any` — use `unknown` or proper types instead
- Prefer `interface` over `type` for object shapes
- Use `const` assertions for string literals

### Backend

- **File naming:** `camelCase.ts` for utilities, `PascalCase.tsx` for components (frontend)
- **Imports:** use `.js` extension in ESM imports (`import { x } from './file.js'`)
- **Error handling:** always catch and log errors with context
- **Database queries:** use Drizzle query builders, never raw SQL strings
- **Route handlers:** keep thin — delegate logic to services

### Frontend

- **Components:** functional components with TypeScript props interfaces
- **Hooks:** custom hooks in `/hooks`, one concern per hook
- **State:** prefer `useState` for local state, custom hooks for shared state
- **API calls:** use the `api`, `get`, `post`, `put`, `del` helpers from `@/lib/api`

### General

- **No console.log** — use the logger utility in backend
- **Don't commit secrets** — `.env` is gitignored, use `.env.example`
- **Keep PRs focused** — one feature/fix per PR
- **Write meaningful commit messages** — follow [Conventional Commits](https://www.conventionalcommits.org/)

---

## Pull Request Process

1. **Fork** the repository
2. **Create a branch:** `feature/your-feature` or `fix/your-bugfix`
3. **Make your changes** following the conventions above
4. **Type-check** both backend and frontend:
   ```bash
   cd backend && npx tsc --noEmit
   cd frontend && npm run build
   ```
5. **Test your changes** manually (automated tests coming soon)
6. **Update documentation** if your changes affect API, config, or user-facing behavior
7. **Push and open a PR** with a clear description:
   - What problem does it solve?
   - How was it solved?
   - Screenshots/videos for UI changes
   - Breaking changes? Migration steps?

### PR Review Checklist

- [ ] TypeScript compiles without errors
- [ ] Frontend builds without errors
- [ ] No commented-out code or debugging leftovers
- [ ] No secrets committed
- [ ] API changes are reflected in docs
- [ ] New environment variables are in `.env.example`

---

## Testing

> Automated testing suite is being set up. Until then:

- **Manual testing:** verify your changes work end-to-end
- **API testing:** use curl or Postman against the running backend
- **UI testing:** navigate through the affected flows manually

### Running Backend & Frontend Together

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev

# Seed DB (first time)
curl -X POST http://localhost:4040/api/seed
```

---

## Documentation

Documentation lives in the `/docs` directory. When adding features:

- Update `docs/API.md` for new/changed endpoints
- Update `docs/CONFIGURATION.md` for new env vars
- Update `docs/INSTALLATION.md` for new setup steps
- Add new docs to the table in `/docs/README.md`

---

## Questions?

- **Open a Discussion** on GitHub
- **Issue** for bugs and features
- **PR comments** for code-specific discussion

---

Thank you for contributing! 🚀
