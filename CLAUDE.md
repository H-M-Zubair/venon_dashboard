# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Venon Dashboard project, a comprehensive analytics and e-commerce management platform with two main components:

1. **Backend Service** (root directory) - TypeScript/Node.js API server
2. **Frontend Application** (`/venon`) - Next.js dashboard application
3. **Old Backend for context** (`/venon-backend`) - Old backend that is solely using supabase

## Development Commands

### Backend Development

```bash
# Install dependencies
npm install

# Development with hot reload
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Run tests
npm run test           # Interactive watch mode (requires 'q' to quit)
npm run test:coverage  # Coverage with watch mode (requires 'q' to quit)

# Run tests in CI mode (non-interactive, auto-exits)
npm run test -- --run
npm run test:coverage -- --run

# Build for production
npm run build
npm start

# Docker development
npm run docker:dev          # Start containers
npm run docker:dev:down     # Stop containers
npm run docker:dev:rebuild  # Full rebuild
```

**Important**: Vitest runs in watch mode by default, which waits for file changes and requires pressing 'q' to quit. When running tests in Claude Code or CI/CD, always use the `-- --run` flag to run tests in CI mode (non-interactive, exits automatically after completion)

### Frontend Development

```bash
cd venon

# Development server
npm run dev

# Production build
npm run build
npm start

# Linting
npm run lint
```

## Architecture Overview

### Backend Architecture

The backend uses a modular Express.js architecture with TypeScript:

- **Entry Points**: `src/index.ts` (server) and `src/app.ts` (Express app)
- **Database Layer**:
  - ClickHouse for analytics data (`src/database/clickhouse.ts`)
  - Supabase for main application data
- **Service Layer**: Business logic in `src/services/` (analytics, pixels, channels, tracking)
- **API Routes**: Modular routes in `src/routes/` with `/api` prefix
- **Middleware**: Authentication (`src/middleware/auth.ts`), validation, error handling
- **Configuration**: Environment validation with Zod (`src/config/`)

Key architectural decisions:

- Path aliases (`@/`) for clean imports
- Strict TypeScript with comprehensive types in `src/types/`
- Winston logging with structured output
- Rate limiting and security headers (Helmet)

### Frontend Architecture

The frontend is a Next.js 14 application with:

- **App Router**: Modern Next.js app directory structure
- **Route Groups**:
  - `(loginsignup)` - Authentication flows
  - `(onboarding)` - Multi-step onboarding
  - `(pages)` - Main dashboard pages
- **State Management**: React Context providers in `/providers`
- **UI Components**: Reusable components with Tailwind CSS
- **Integrations**: Ad platforms (Google, Meta, TikTok), Shopify, Stripe

## Key Services and Features

### Analytics Service (`src/services/analytics.ts`)

- Handles pixel data aggregation from ClickHouse
- Provides funnel analytics, conversion tracking
- Real-time and historical data processing

### Pixel Service (`src/services/pixels.ts`)

- Manages tracking pixel creation and configuration
- Handles pixel-to-channel associations

### Channel Service (`src/services/channels.ts`)

- Manages advertising channel integrations
- Channel performance tracking

### Tracking Service (`src/services/tracking.ts`)

- Processes incoming tracking events
- Data validation and storage

## Database Schema

### ClickHouse Tables

- `pixel_events` - Raw tracking events
- `channels` - Ad channel configurations
- `pixels` - Tracking pixel definitions

### Key Relationships

- Pixels belong to users and can be associated with channels
- Events are linked to pixels and contain conversion/revenue data

## Testing Strategy

- Unit tests with Vitest
- Test files co-located with source files (`.test.ts`)
- Coverage reporting available via `npm run test:coverage`

## Environment Configuration

Required environment variables:

- `CLICKHOUSE_URL` - ClickHouse connection string
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `NODE_ENV` - Environment (development/staging/production)
- `PORT` - Server port (default: 3001)

## Common Development Tasks

### Adding a New API Endpoint

1. Create route handler in `src/routes/`
2. Add business logic in `src/services/`
3. Define types in `src/types/`
4. Update route registration in `src/routes/index.ts`

### Working with ClickHouse

- Queries are in `src/services/` files
- Use parameterized queries for security
- Test with local ClickHouse instance via Docker

### Frontend Development

- Components use TypeScript with strict typing
- Forms use React Hook Form with Zod validation
- API calls go through `/app/api/` routes or direct to backend

## Agents & MCP

- Use specific claude agents for the specific tasks and use the available mcp services
