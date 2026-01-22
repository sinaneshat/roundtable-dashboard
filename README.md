# 🤖 Roundtable Platform

<div align="center">

[![Next.js](https://img.shields.io/badge/Next.js-15.3.2-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue)](https://typescriptlang.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)](https://workers.cloudflare.com)
[![React](https://img.shields.io/badge/React-19.1.0-61dafb)](https://reactjs.org)

*Watch multiple models debate and brainstorm together*

[Features](#-features) • [Quick Start](#-quick-start) • [Architecture](#-architecture) • [Documentation](#-documentation) • [Deployment](#-deployment)

</div>

---

## 📖 Overview

Roundtable Platform is an enterprise-grade SaaS application where you can watch multiple models debate and brainstorm together. Built with cutting-edge web technologies and deployed on Cloudflare's global edge network, it provides lightning-fast performance, robust security, and comprehensive user management functionality.

### 🎯 Key Highlights

- **🤖 AI Platform Focused**: Designed for multi-model AI collaboration
- **🚀 Edge-First Architecture**: Deployed on Cloudflare Workers for global performance
- **🔐 Enterprise Security**: Advanced authentication with Better Auth
- **📊 User Management**: Complete user lifecycle and access control
- **🌐 English-Only**: Streamlined English interface with dynamic translation keys
- **🎨 Modern UI/UX**: Beautiful, responsive interface with shadcn/ui

---

## ✨ Features

### 👥 User Management
- **User Profiles**: Complete user profile management and customization
- **Access Control**: Granular role-based permission system
- **User Activity Tracking**: Detailed audit trails and event logging
- **Multi-Model Collaboration**: Specialized features for AI collaboration sessions
- **Team Management**: Organize users into teams and workspaces

### 🔐 Authentication & Security
- **Better Auth**: Modern authentication with multiple providers
- **Session Management**: Secure session handling with JWT
- **Role-Based Access**: Granular permission system
- **Account Verification**: Email verification and phone validation
- **Security Monitoring**: Failed login tracking and account lockouts

### 📊 Dashboard & Analytics
- **Real-time Overview**: Live platform metrics and user activity
- **Usage Analytics**: Comprehensive reporting and insights
- **User Activity**: Detailed audit trails and event logging
- **AI Usage Metrics**: Track multi-model collaboration usage

### 🏗️ Architecture & Infrastructure
- **Cloudflare Workers**: Edge computing for global performance
- **D1 Database**: Serverless SQLite with global replication
- **R2 Storage**: Object storage for files and assets
- **KV Storage**: Low-latency key-value store for caching
- **Email Services**: AWS SES integration for transactional emails
- **Web Search**: AI-optimized query generation (3-8 keywords) for relevant results

### 🌐 Localization Features
- **English-Only**: Streamlined English interface with dynamic translation keys
- **i18n Infrastructure**: Translation key system for maintainable text management
- **Timezone Handling**: Proper date/time localization
- **Internationalization Ready**: Extensible i18n framework for future locales

---

## 🛠️ Technology Stack

### Core Framework
- **[Next.js 15.3.2](https://nextjs.org)** - React framework with App Router
- **[React 19.1.0](https://reactjs.org)** - Latest React with concurrent features
- **[TypeScript 5.8.3](https://typescriptlang.org)** - Type-safe development

### Backend & Database
- **[Hono 4.9.1](https://hono.dev)** - Ultrafast web framework for Cloudflare Workers
- **[Drizzle ORM 0.44.4](https://orm.drizzle.team)** - Type-safe database ORM
- **[Cloudflare D1](https://developers.cloudflare.com/d1/)** - Serverless SQLite database
- **[Better Auth 1.3.11](https://better-auth.com)** - Modern authentication solution

### UI & Styling
- **[shadcn/ui](https://ui.shadcn.com)** - High-quality component library
- **[Tailwind CSS 4.1.7](https://tailwindcss.com)** - Utility-first CSS framework
- **[Radix UI](https://radix-ui.com)** - Accessible component primitives
- **[Lucide Icons 0.511.0](https://lucide.dev)** - Beautiful icon library

### Data Management
- **TanStack Query 5.77.0** - Data fetching and caching
- **Zod** - Runtime type validation
- **React Hook Form** - Form state management

### Development & Deployment
- **[Cloudflare Workers](https://workers.cloudflare.com)** - Edge computing platform
- **[Wrangler 4.29.1](https://developers.cloudflare.com/workers/wrangler/)** - Cloudflare CLI tool
- **[ESLint](https://eslint.org)** - Code linting and formatting

### Additional Services
- **[React Email 4.0.15](https://react.email)** - Email template system
- **[AWS SES](https://aws.amazon.com/ses/)** - Email delivery service
- **[R2 Storage](https://developers.cloudflare.com/r2/)** - Object storage
- **[KV Storage](https://developers.cloudflare.com/kv/)** - Key-value caching

---

## 🚀 Quick Start

### Prerequisites

Ensure you have the following installed:

- **Node.js**: Version 22.14.0 or higher
- **Bun**: Version 1.2.15 or higher
- **Git**: For version control

```bash
# Verify installations
node --version  # Should be 22.14.0+
bun --version   # Should be 1.2.15+
```

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/roundtable/platform.git
   cd platform
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Environment setup**
   ```bash
   # Copy environment template
   cp .env.example .env

   # Edit environment file with your configuration
   ```

4. **Database setup**
   ```bash
   # Generate database schema
   bun run db:generate

   # Apply migrations
   bun run db:migrate:local

   # Seed with sample data
   bun run db:fresh:quick
   ```

5. **Start development server**
   ```bash
   bun run dev
   ```

Visit [http://localhost:3000](http://localhost:3000) to see your application running!

---

## ⚙️ Configuration

### Environment Variables

Create `.env` file in the project root using `.env.example` as template:

#### Required Variables

```bash
# Application Environment
NODE_ENV=development
NEXT_PUBLIC_WEBAPP_ENV=local
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Authentication - Generate secure secrets
BETTER_AUTH_SECRET=your-better-auth-secret-32-chars-minimum
BETTER_AUTH_URL=http://localhost:3000

# Google OAuth - Get from Google Cloud Console
AUTH_GOOGLE_ID=your-google-client-id.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=your-google-client-secret

# AWS SES Email - Get from AWS Console
AWS_SES_ACCESS_KEY_ID=your-aws-ses-access-key-id
AWS_SES_SECRET_ACCESS_KEY=your-aws-ses-secret-access-key
NEXT_PUBLIC_AWS_SES_REGION=your-aws-region
NEXT_PUBLIC_FROM_EMAIL=noreply@your-domain.com
NEXT_PUBLIC_SES_REPLY_TO_EMAIL=support@your-domain.com
NEXT_PUBLIC_SES_VERIFIED_EMAIL=noreply@your-domain.com
```

---

## 🗄️ Database

### Schema Overview

The database includes core authentication tables:

- **Authentication**: Users, sessions, accounts, verification
  - `user`: Core user information with email verification and ban management
  - `session`: Secure session tracking with IP address and user agent
  - `account`: OAuth provider integrations (Google, etc.)
  - `verification`: Email verification tokens and password reset flows

### Database Commands

```bash
# Development
bun run db:generate         # Generate migrations
bun run db:migrate:local    # Apply migrations locally
bun run db:studio:local     # Open Drizzle Studio
bun run db:fresh:quick      # Reset and seed database

# Preview Environment
bun run db:migrate:preview  # Apply to preview database
bun run db:studio:preview   # Studio for preview

# Production
bun run db:migrate:prod     # Apply to production database
bun run db:studio:prod      # Studio for production
```

### Data Models

#### User & Authentication (Currently Implemented)
- **Users**: Core user information with security tracking
  - Email verification status
  - Ban management (banned, banReason, banExpires)
  - Role-based access control
  - Timestamps (createdAt, updatedAt)
- **Sessions**: Secure session management with device tracking
  - Session tokens with expiration
  - IP address and user agent tracking
  - Impersonation support
- **Accounts**: OAuth and social login integrations
  - Multiple OAuth providers (Google, etc.)
  - Access and refresh token management
  - Provider-specific account IDs
- **Verification**: Email verification and password reset flows
  - Time-limited verification tokens
  - Identifier-based verification (email, phone)

---

## 🏗️ API Structure

### Current API Routes

The API is organized by domain under `/src/api/routes/`:

#### Authentication (`/api/v1/auth/*`)
- Better Auth integration for complete authentication flows
- Sign up, sign in, sign out, email verification
- OAuth providers (Google)
- Magic link authentication
- Session management

#### System (`/api/v1/system/*`)
- Health check endpoint
- System status monitoring
- API version information

#### Currency (`/api/v1/currency/*`)
- Currency conversion and formatting
- Locale-specific currency display

#### Email (`/api/v1/emails/*`)
- Email sending operations
- Template rendering
- Email verification and notifications

---

## 🚀 Deployment

### Cloudflare Workers Deployment

#### Prerequisites
1. Cloudflare account with Workers enabled
2. Domain configured in Cloudflare
3. D1 database created
4. R2 buckets configured

#### Deployment Commands

```bash
# Preview deployment
bun run deploy:preview

# Production deployment
bun run deploy:production

# Quick preview build
bun run preview
```

#### Environment Setup

1. **Create D1 Databases**
   ```bash
   wrangler d1 create platform-d1-preview
   wrangler d1 create platform-d1-prod
   ```

2. **Create R2 Buckets**
   ```bash
   wrangler r2 bucket create platform-uploads-preview
   wrangler r2 bucket create platform-uploads-prod
   ```

3. **Set Environment Secrets**
   ```bash
   # Preview environment
   wrangler secret put BETTER_AUTH_SECRET --env preview
   wrangler secret put AWS_SES_ACCESS_KEY_ID --env preview
   wrangler secret put AWS_SES_SECRET_ACCESS_KEY --env preview

   # Production environment
   wrangler secret put BETTER_AUTH_SECRET --env production
   wrangler secret put AWS_SES_ACCESS_KEY_ID --env production
   wrangler secret put AWS_SES_SECRET_ACCESS_KEY --env production
   ```

4. **Deploy Database Schema**
   ```bash
   # Preview
   bun run db:migrate:preview

   # Production
   bun run db:migrate:prod
   ```

### Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] DNS records configured
- [ ] SSL certificates active
- [ ] AWS SES configured for emails
- [ ] Google OAuth credentials configured
- [ ] Monitoring and alerts set up

---

## 🔧 Development

### Development Workflow

```bash
# Start development server
bun run dev

# Run linting
bun run lint
bun run lint:fix

# Type checking
bun run check-types

# Database development
bun run db:studio:local

# Email template development
bun run email:preview
```

### Code Quality

- **ESLint**: Code linting with Antfu config
- **TypeScript**: Strict type checking
- **Prettier**: Code formatting
- **Husky**: Git hooks for quality gates
- **Commitlint**: Conventional commit messages

### Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (app)/chat/   # Protected dashboard routes
│   ├── auth/              # Authentication pages
│   ├── api/               # Next.js API routes (proxy)
│   ├── privacy/           # Privacy policy page
│   └── terms/             # Terms of service page
├── api/                   # Hono API implementation
│   ├── routes/            # Domain-specific routes
│   │   ├── auth/          # Better Auth integration
│   │   ├── currency/      # Currency management
│   │   ├── emails/        # Email operations
│   │   └── system/        # System health and status
│   ├── services/          # Business logic (currently empty - to be implemented)
│   ├── middleware/        # Auth, CORS, rate limiting
│   ├── core/              # Framework foundations
│   ├── common/            # Shared utilities
│   ├── patterns/          # Architectural patterns
│   ├── types/             # Type definitions
│   ├── utils/             # Helper utilities
│   └── client/            # API client configuration
├── components/            # React components
│   ├── ui/                # shadcn/ui base components
│   ├── auth/              # Authentication UI
│   ├── dashboard/         # Dashboard-specific components
│   ├── forms/             # Form components
│   ├── logo/              # Logo components
│   ├── providers/         # Context providers
│   └── seo/               # SEO components
├── containers/            # Page-level containers
│   ├── layouts/           # Layout components (auth, home, root)
│   ├── screens/           # Screen components (auth, dashboard, errors, general, legal)
│   └── providers/         # Container-level providers
├── db/                    # Database layer
│   ├── tables/            # Drizzle schema definitions
│   │   └── auth.ts        # Users, sessions, accounts, verification
│   ├── validation/        # Schema validation
│   └── migrations/        # SQL migration files
├── emails/                # Email template system
│   ├── components/        # Email components (content, display, footer, header, layout)
│   └── templates/         # Email templates (auth)
├── hooks/                 # React Query and custom hooks
│   └── utils/             # Hook utilities
├── lib/                   # Utility libraries
│   ├── auth/              # Auth utilities (client, server)
│   ├── data/              # Data utilities
│   ├── email/             # Email utilities
│   ├── format/            # Formatting utilities
│   ├── i18n/              # i18n utilities
│   ├── toast/             # Toast notifications
│   ├── ui/                # UI utilities
│   └── utils/             # General utilities
├── i18n/                  # Internationalization (English-only, dynamic keys)
│   └── locales/en/        # English translations
├── icons/                 # Icon system
│   ├── component/         # Icon components
│   └── svg/               # SVG icons
├── constants/             # Application constants
├── styles/                # Global styles
├── types/                 # TypeScript type definitions
└── utils/                 # Utility functions
```

---

## 📚 Documentation

### Additional Resources

- [Setup Guide](./docs/SETUP.md) - Detailed setup instructions
- [Backend Patterns](./docs/backend-patterns.md) - Backend architecture patterns
- [Frontend Patterns](./docs/frontend-patterns.md) - Frontend development patterns

### Features Documentation

#### User Management System
- Complete user lifecycle management
- Team and organization structures
- Role-based access control
- User activity tracking and audit logs

#### Security Features
- JWT-based authentication with Better Auth
- CSRF protection and secure headers
- Rate limiting on all API endpoints
- Secure data encryption and storage

#### Performance Optimizations
- Edge-first architecture with Cloudflare Workers
- Database connection pooling
- Aggressive caching strategies
- Image optimization with Next.js

---

## 🔧 Available Scripts

### Development
```bash
bun run dev                 # Start development with turbo
bun run build               # Build for production
bun run lint                # Run ESLint
bun run lint:fix            # Fix ESLint issues
bun run check-types         # TypeScript type checking
bun run lint:modified       # Lint only modified files
```

### Database Management
```bash
bun run db:generate         # Generate Drizzle migrations
bun run db:migrate:local    # Apply migrations locally
bun run db:migrate:preview  # Apply migrations to preview
bun run db:migrate:prod     # Apply migrations to production
bun run db:studio:local     # Open Drizzle Studio
bun run db:fresh:quick      # Reset and seed database quickly
bun run db:full-reset:local # Complete database reset
```

### Cloudflare Deployment
```bash
bun run cf-typegen          # Generate CloudflareEnv types
bun run preview             # Build and preview worker locally
bun run deploy:preview      # Deploy to preview environment
bun run deploy:production   # Deploy to production
```

### Testing & Quality
```bash
bun run i18n:full-check     # Check all i18n translations
bun run i18n:validate       # Validate translation structure
bun run i18n:check-unused   # Find unused translation keys
```

---

## 🙏 Acknowledgments

- **[Roundtable](https://roundtable.now)** - For creating this advanced AI collaboration platform
- **[Next.js](https://nextjs.org)** - For the amazing React framework
- **[Cloudflare](https://cloudflare.com)** - For the edge computing platform
- **[shadcn](https://twitter.com/shadcn)** - For the beautiful UI component library
- **Open-source community** - For contributions, feedback, and continuous improvement

---

## 🆘 Support

- **Documentation**: Check our [docs](./docs/) directory
- **Issues**: [GitHub Issues](https://github.com/roundtable/platform/issues)
- **Repository**: [GitHub Repository](https://github.com/roundtable/platform)

---

<div align="center">

**Roundtable Platform**

*Watch multiple models debate and brainstorm together*

*Built by [Roundtable](https://roundtable.now/) for the AI collaboration community*

</div>