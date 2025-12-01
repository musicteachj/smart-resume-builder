# RESUME BUILDER - COMPLETE IMPLEMENTATION GUIDE FOR CURSOR & CLAUDE

---

## HOW TO USE THIS GUIDE

This is a phase-by-phase implementation guide for building the Resume Builder application.

**INSTRUCTIONS:**

- Copy relevant sections into Cursor as you work through each phase
- Follow each phase in sequential order
- Complete all steps in a phase before moving to the next
- Commit to Git after each phase
- Test thoroughly at verification points

### MVP VS POST-MVP SCOPE

- **MVP focus:** Phases 1–11 plus 14–24 ship a polished email/password resume builder with live editing, PDF export, testing, and deployment.
- **Post-MVP enhancements:** Google OAuth + account linking and the Claude-powered AI improvement flow are intentionally deferred. Complete them only after the base experience is live (see the Post-MVP callouts in Phases 5, 7, 12, 13, 20, and 21).

---

## APPLICATION OVERVIEW

### WHAT IS THIS APP?

An AI-powered resume builder that helps users create professional resumes with intelligent content improvements. Users can create multiple resumes, get AI suggestions to enhance their bullet points, preview their resume in real-time, and export to PDF.

### CORE FEATURES

1. **Dual Authentication System**

   - MVP: Register/login with email and password (JWT sessions)
   - Post-MVP: Sign in with Google OAuth + account linking

2. **Resume Management**

   - Create, read, update, delete resumes
   - Multiple resumes per user
   - Dashboard showing all user resumes

3. **Resume Editor**

   - Split-screen interface (form on left, live preview on right)
   - Sections: Personal Info, Work Experience, Education, Skills, Projects
   - Real-time preview updates
   - Form validation with Zod
   - Auto-save functionality

4. **AI-Powered Content Improvement** _(Post-MVP)_

   - "Improve with AI" button on each work experience bullet point
   - Uses Claude API to enhance bullet points
   - Before/after comparison modal
   - Accept/regenerate/cancel workflow
   - Usage limits: 10 calls/day, 50/month for free users, unlimited for admin

5. **PDF Export**

   - Server-side generation using Puppeteer
   - Perfect fidelity to preview
   - Professional formatting
   - One-click download

6. **Cost Protection** _(Post-MVP alongside AI)_
   - AI usage tracking per user
   - Daily and monthly limits
   - Admin users have unlimited access
   - Clear UI feedback on remaining calls

---

## COMPLETE TECHNOLOGY STACK

### FRONTEND

- React 18 (UI framework)
- TypeScript (type safety)
- Vite (build tool and dev server)
- Tailwind CSS (styling)
- React Router (routing)
- React Hook Form (form state management)
- @hookform/resolvers/zod (form validation)
- TanStack Query / React Query (server state management)
- Axios (HTTP client)
- Jest (testing framework)
- React Testing Library (component testing)

### BACKEND

- Node.js 18 (runtime)
- Express (web framework)
- TypeScript (type safety)
- Prisma (ORM)
- PostgreSQL 15 (database)
- Passport.js (authentication middleware)
  - passport-google-oauth20 (Google OAuth)
  - passport-local (email/password)
  - passport-jwt (JWT verification)
- jsonwebtoken (JWT generation)
- bcrypt (password hashing - 10 rounds)
- Puppeteer (PDF generation)
- React Server-Side Rendering (for PDF templates)
- Jest + Supertest (testing)
- @anthropic-ai/sdk (Claude API)

### SHARED/MONOREPO

- pnpm (package manager)
- pnpm workspaces (monorepo management)
- Zod (schema validation - shared)
- TypeScript types (shared interfaces)
- React components (resume templates)

### DATABASE

- PostgreSQL 15 (relational database)
- Prisma (ORM with type-safe queries)
- Prisma Migrate (database migrations)

### DEVOPS & INFRASTRUCTURE

- Docker (containerization)
- Docker Compose (local development)
- AWS ECS Fargate (container orchestration)
- AWS ECR (container registry)
- AWS RDS (managed PostgreSQL)
- AWS Secrets Manager (secure environment variables)
- GitHub Actions (CI/CD pipeline)

### EXTERNAL SERVICES

- Google Cloud Console (OAuth credentials)
- Anthropic API (Claude AI)
- Custom domain: resume.jameslittlefield.net

---

## DATABASE SCHEMA DESIGN

### USER TABLE

```prisma
model User {
  id               String      @id @default(uuid())
  email            String      @unique
  name             String
  googleId         String?     @unique
  password         String?
  aiCallsToday     Int         @default(0)
  aiCallsThisMonth Int         @default(0)
  lastAiCallDate   DateTime?
  lastMonthReset   DateTime    @default(now())
  isAdmin          Boolean     @default(false)
  resumes          Resume[]
  aiUsage          AIUsageLog[]
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt

  @@index([email])
  @@index([googleId])
}
```

### RESUME TABLE

```prisma
model Resume {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String
  template  String   @default("classic")
  content   Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
}
```

### AIUSAGELOG TABLE

```prisma
model AIUsageLog {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  feature      String
  inputLength  Int
  outputLength Int
  success      Boolean
  createdAt    DateTime @default(now())

  @@index([userId, createdAt])
}
```

---

## RESUME CONTENT STRUCTURE (JSONB)

```typescript
{
  personalInfo: {
    name: string,
    email: string,
    phone?: string,
    location?: string,
    linkedin?: string,
    github?: string
  },
  summary?: string,
  workExperience: [
    {
      id: string,
      company: string,
      position: string,
      location?: string,
      startDate: string, // YYYY-MM format
      endDate?: string, // YYYY-MM format or null
      bullets: string[]
    }
  ],
  education: [
    {
      id: string,
      school: string,
      degree: string,
      field: string,
      graduationDate: string, // YYYY-MM format
      gpa?: string
    }
  ],
  skills: string[],
  projects?: [
    {
      id: string,
      name: string,
      description: string,
      technologies: string[],
      url?: string
    }
  ]
}
```

---

## AUTHENTICATION FLOWS

### GOOGLE OAUTH FLOW

1. User clicks "Sign in with Google"
2. Redirect to Google OAuth consent screen
3. Google redirects back with authorization code
4. Backend exchanges code for user profile
5. Find or create user in database
6. If email exists but no googleId, link the accounts
7. Check if user email is in ADMIN_EMAILS, set isAdmin if true
8. Generate JWT token
9. Redirect to frontend with token
10. Frontend stores token in localStorage

### EMAIL/PASSWORD REGISTRATION

1. User fills registration form (name, email, password, confirmPassword)
2. Frontend validates with Zod schema
3. Submit to backend /auth/register
4. Backend validates again with Zod
5. Check if email already exists
6. Hash password with bcrypt (10 rounds)
7. Create user in database
8. Check if user email is in ADMIN_EMAILS, set isAdmin if true
9. Generate JWT token
10. Return token and user data

### EMAIL/PASSWORD LOGIN

1. User fills login form (email, password)
2. Frontend validates with Zod
3. Submit to backend /auth/login
4. Backend finds user by email
5. Verify password with bcrypt.compare()
6. Check if user email is in ADMIN_EMAILS, update isAdmin if needed
7. Generate JWT token
8. Return token and user data

### JWT STRUCTURE

```typescript
{
  userId: string,
  email: string,
  isAdmin: boolean,
  iat: number,
  exp: number  // expires in 7 days
}
```

---

## AI USAGE LIMITS SYSTEM

### FREE TIER USERS

- 10 AI calls per day
- 50 AI calls per month
- Daily counter resets at midnight
- Monthly counter resets every 30 days

### ADMIN USERS

- Unlimited AI calls
- Determined by isAdmin flag in database
- Can be set via ADMIN_EMAILS environment variable

### DEVELOPMENT MODE

- All limits bypassed when NODE_ENV=development
- Unlimited for local testing

### ENFORCEMENT FLOW

1. User clicks "Improve with AI"
2. Frontend sends request to /api/ai/improve-bullet
3. Middleware checks if user is admin or dev mode → skip limits
4. Middleware fetches user's aiCallsToday and aiCallsThisMonth
5. Check if daily counter needs reset (new day)
6. Check if monthly counter needs reset (30+ days)
7. If at or over limit, return 429 error with clear message
8. If under limit, proceed with AI call
9. After successful AI response, increment counters
10. Return AI-improved content with usage stats

---

## PDF GENERATION PROCESS

1. User clicks "Export PDF" button
2. Frontend sends resume ID to backend /api/resumes/:id/export
3. Backend fetches resume from database
4. Backend renders React template component to HTML string using react-dom/server
5. Wrap HTML with full document structure including Tailwind CDN
6. Launch Puppeteer headless browser
7. Load HTML into browser page
8. Wait for Tailwind CSS to load (networkidle0)
9. Generate PDF with proper margins and formatting (Letter size)
10. Close browser
11. Return PDF buffer to frontend
12. Frontend creates blob and triggers download

---

## IMPLEMENTATION PHASES

### PART I – MVP LAUNCH (EMAIL AUTH + CORE FEATURES)

Phases 1–11 and 14–24 take you from empty repo to a polished first release. Work through them in order before touching any Google OAuth or AI features.

---

### PHASE 1: PROJECT INITIALIZATION

**GOAL:** Set up monorepo structure and basic configuration

**STEPS:**

1. Create project directory and initialize Git
2. Create pnpm workspace configuration (pnpm-workspace.yaml)
3. Create root package.json with workspace scripts
4. Create root TypeScript configuration
5. Create .gitignore file
6. Create directory structure:
   - apps/client/
   - apps/server/
   - packages/shared/
   - prisma/
   - .github/workflows/
7. Create README.md with project overview
8. Install root dependencies (concurrently, typescript)
9. Commit: "Initialize monorepo structure"

**TECHNOLOGIES:** pnpm workspaces, TypeScript, Git

---

### PHASE 2: SHARED PACKAGE SETUP

**GOAL:** Create shared package with types, schemas, and constants

**STEPS:**

1. Create packages/shared/package.json with dependencies (zod, react, typescript)
2. Create packages/shared/tsconfig.json
3. Create type definitions:
   - types/resume.types.ts (Resume, ResumeContent, PersonalInfo, WorkExperience, Education, Project)
   - types/user.types.ts (User, AuthResponse, AIUsage)
   - types/index.ts (export all types)
4. Create Zod validation schemas:
   - schemas/resume.schema.ts (PersonalInfoSchema, WorkExperienceSchema, EducationSchema, ProjectSchema, ResumeContentSchema, CreateResumeSchema, UpdateResumeSchema)
   - schemas/auth.schema.ts (PasswordSchema, RegisterSchema, LoginSchema)
   - schemas/index.ts (export all schemas)
5. Create constants/index.ts (AI_LIMITS, AI_FEATURES, TEMPLATES)
6. Create main index.ts export file
7. Install dependencies and build package
8. Commit: "Add shared package with types and schemas"

**TECHNOLOGIES:** TypeScript, Zod, React types

**VALIDATION LIMITS:**

- Max 10 work experiences per resume
- Max 10 bullets per work experience
- Max 5 education entries
- Max 50 skills
- Max 5 projects
- Max 500 characters per bullet
- Password: min 8 chars, must contain uppercase, lowercase, number

---

### PHASE 3: DATABASE SETUP

**GOAL:** Set up PostgreSQL database with Prisma ORM

**STEPS:**

1. Create prisma/schema.prisma with complete schema (User, Resume, AIUsageLog models)
2. Create Docker Compose file for local PostgreSQL
3. Create .env.example with all required environment variables
4. Create .env file (copy from .env.example)
5. Start PostgreSQL container with Docker Compose
6. Run initial Prisma migration (name: "init")
7. Test database connection with Prisma Studio
8. Commit: "Set up Prisma and PostgreSQL"

**TECHNOLOGIES:** Prisma, PostgreSQL 15, Docker Compose

**ENVIRONMENT VARIABLES NEEDED:**

```bash
DATABASE_URL=postgresql://resume_user:resume_pass@localhost:5432/resume_builder
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=(create later at console.cloud.google.com)
GOOGLE_CLIENT_SECRET=(create later)
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
ANTHROPIC_API_KEY=(create later at console.anthropic.com)
NODE_ENV=development
PORT=3000
CLIENT_URL=http://localhost:5173
ADMIN_EMAILS=your-email@gmail.com
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
```

---

### PHASE 4: BACKEND FOUNDATION

**GOAL:** Set up Express server with basic configuration

**STEPS:**

1. Create apps/server/package.json with all backend dependencies
2. Create apps/server/tsconfig.json
3. Create config/env.ts (validate environment variables with Zod)
4. Create config/database.ts (Prisma client singleton)
5. Create middleware/error.middleware.ts (global error handler, handles ZodError)
6. Create middleware/logger.middleware.ts (request logging)
7. Create main server file (src/index.ts):
   - Initialize Express app
   - Configure CORS with CLIENT_URL
   - Add body parser (express.json())
   - Add logger middleware
   - Add health check endpoint (GET /health)
   - Add error handler middleware (must be last)
   - Start server on PORT
8. Install dependencies
9. Generate Prisma client (pnpm prisma:generate)
10. Start server and test health endpoint
11. Commit: "Set up Express server foundation"

**TECHNOLOGIES:** Express, TypeScript, Prisma Client, dotenv, cors

---

### PHASE 5: AUTHENTICATION BACKEND (MVP FIRST)

**GOAL:** Ship secure email/password authentication with JWT sessions now. Defer Google OAuth + account linking until after the MVP launch.

**MVP STEPS (DO NOW):**

1. Create JWT utilities (utils/jwt.ts):
   - `generateJWT(payload)` function
   - `verifyJWT(token)` function
2. Create Passport configuration (config/passport.ts):
   - Local strategy (email/password, verify with bcrypt, check admin flag)
   - JWT strategy (verify token, load user)
3. Create auth middleware (middleware/auth.middleware.ts):
   - `authenticateJWT` function using passport
   - `AuthRequest` type that attaches the user
4. Create auth routes (routes/auth.routes.ts):
   - `POST /auth/register` (RegisterSchema → bcrypt hash → create user → return JWT + user)
   - `POST /auth/login` (LoginSchema → verify password → return JWT + user)
   - `GET /auth/me` (requires `authenticateJWT`, returns current user)
   - `POST /auth/logout` (simple confirmation endpoint for client-side token clearing)
5. Update main server file to:
   - Import passport config
   - `app.use(passport.initialize())`
   - `app.use('/auth', authRoutes)`
6. Test register/login/me/logout flows with curl/Postman
7. Commit: "Implement authentication backend (email/password MVP)"

**POST-MVP EXTENSION:** Once the MVP is live, jump to **Part II → Phase B** for the detailed Google OAuth + account-linking rollout.

**TECHNOLOGIES:** Passport.js, passport-local, passport-jwt, jsonwebtoken, bcrypt (10 rounds), Zod

---

### PHASE 6: FRONTEND FOUNDATION

**GOAL:** Set up React application with routing and auth

**STEPS:**

1. Create apps/client/package.json with all frontend dependencies
2. Create apps/client/tsconfig.json and tsconfig.node.json
3. Create Vite configuration (vite.config.ts) with path aliases and proxy
4. Set up Tailwind CSS:
   - tailwind.config.js
   - postcss.config.js
   - src/index.css with Tailwind directives
5. Create index.html and src/main.tsx
6. Create .env.example and .env with VITE_API_URL=http://localhost:3000
7. Create API client (lib/api.ts):
   - Axios instance with baseURL
   - Request interceptor to add auth token from localStorage
   - Response interceptor to handle 401 errors (clear token, redirect to login)
8. Create React Query client (lib/queryClient.ts)
9. Create Auth Context (contexts/AuthContext.tsx):
   - Manage user state
   - login(token, user) function
   - logout() function
   - Load user from /auth/me on mount if token exists
   - Export useAuth hook
10. Create common components:
    - components/common/Button.tsx (variants: primary, secondary, outline)
    - components/common/Spinner.tsx
11. Create basic pages:
    - pages/LandingPage.tsx (marketing page with features)
    - pages/DashboardPage.tsx (placeholder)
12. Create App.tsx with routing:
    - ProtectedRoute component (checks useAuth, shows spinner while loading)
    - Routes: /, /login, /dashboard
    - Wrap with AuthProvider and QueryClientProvider
13. Install dependencies and start dev server
14. Test navigation
15. Commit: "Set up React frontend foundation"

**TECHNOLOGIES:** React 18, Vite, Tailwind CSS, React Router, Axios, TanStack Query

---

### PHASE 7: AUTHENTICATION UI (MVP FIRST)

**GOAL:** Deliver a polished email/password experience now. Layer Google OAuth UI after the initial release.

**MVP STEPS (DO NOW):**

1. Create auth page (`pages/AuthPage.tsx`):
   - Toggle between login and register modes
   - Email/password form built with React Hook Form + Zod
   - Divider text for potential future OAuth button
2. Create `PasswordRequirements` component:
   - Visual checkmarks for 8+ chars, uppercase, lowercase, number
3. Implement login form:
   - Inputs + validation via `LoginSchema`
   - Submit to `/auth/login`
   - On success: call `login()` from `useAuth`, navigate to `/dashboard`
   - On error: display inline message
4. Implement register form:
   - Fields: name, email, password, confirmPassword
   - Validation via `RegisterSchema`
   - Show `PasswordRequirements` as user types
   - Submit to `/auth/register`, log user in on success
5. Wire routes in `App.tsx`:
   - `/login` → `AuthPage`
6. Test register/login happy paths + validation errors
7. Commit: "Implement authentication UI (email/password MVP)"

**POST-MVP EXTENSION:** For the Google OAuth button + callback flow, see **Part II → Phase C** once Part I is complete.

**TECHNOLOGIES:** React Hook Form, @hookform/resolvers, Zod, Tailwind CSS

---

### PHASE 8: RESUME CRUD BACKEND

**GOAL:** Build API endpoints for resume management

**STEPS:**

1. Create resume service (services/resume.service.ts):
   - getAllResumesByUserId(userId)
   - getResumeById(id, userId) - verify ownership
   - createResume(userId, data)
   - updateResume(id, userId, data) - verify ownership
   - deleteResume(id, userId) - verify ownership
2. Create resume controller (controllers/resume.controller.ts):
   - Handlers for all CRUD operations
   - Use resume service
   - Validate with Zod schemas
   - Return appropriate status codes (200, 201, 204, 400, 404)
3. Create resume routes (routes/resume.routes.ts):
   - GET /api/resumes (list all user resumes, requires auth)
   - GET /api/resumes/:id (get single resume, requires auth, verify ownership)
   - POST /api/resumes (create, requires auth, validate with CreateResumeSchema)
   - PUT /api/resumes/:id (update, requires auth, validate with UpdateResumeSchema, verify ownership)
   - DELETE /api/resumes/:id (delete, requires auth, verify ownership)
4. Update main server file:
   - Add resume routes (app.use('/api/resumes', authenticateJWT, resumeRoutes))
5. Test all endpoints with curl or Postman
6. Commit: "Implement resume CRUD backend"

**TECHNOLOGIES:** Express, Prisma, Zod

---

### PHASE 9: DASHBOARD UI

**GOAL:** Build dashboard showing all user resumes

**STEPS:**

1. Create custom hook (hooks/useResumes.ts):
   - Use TanStack Query to fetch resumes from /api/resumes
   - Include mutations for create, update, delete
   - Handle loading and error states
   - Invalidate cache after mutations
2. Create ResumeCard component (components/dashboard/ResumeCard.tsx):
   - Display resume title
   - Show last updated date (formatted)
   - Edit button (navigate to /editor/:id)
   - Delete button with confirmation
   - Card styling with hover effects
3. Update DashboardPage:
   - Fetch resumes with useResumes hook
   - Show loading spinner while fetching
   - Show "Create New Resume" button (prominent)
   - Grid of ResumeCard components (responsive grid)
   - Empty state if no resumes ("Create your first resume")
4. Create new resume flow:
   - Modal or simple form with title input
   - Template selector (Classic only for now)
   - Creates resume with empty content structure
   - Navigates to editor
5. Implement delete confirmation modal
6. Add header with user name and logout button
7. Test complete dashboard flow
8. Commit: "Implement dashboard UI"

**TECHNOLOGIES:** React, TanStack Query, Tailwind CSS

---

### PHASE 10: RESUME EDITOR FORM

**GOAL:** Build multi-section resume editor with validation

**STEPS:**

1. Create editor page (pages/EditorPage.tsx):
   - Fetch resume by ID from URL params
   - Show loading spinner while fetching
   - Show error if resume not found
   - Layout: header + split-screen body
   - Header: back button, resume title, save status, export button
2. Create main editor form (components/editor/EditorForm.tsx):
   - Initialize React Hook Form with ResumeContentSchema
   - Load resume content as default values
   - Auto-save on change (debounced 2 seconds)
   - Show save status (Saving... / Saved / Error)
3. Create section components:
   - PersonalInfoForm.tsx
   - WorkExperienceForm.tsx (array field with bullets)
   - EducationForm.tsx (array field)
   - SkillsForm.tsx (array input)
   - ProjectsForm.tsx (optional array field)
   - SummaryForm.tsx (optional textarea)
4. Implement comprehensive form validation with Zod
5. Show validation errors inline
6. Implement auto-save functionality
7. Test form extensively
8. Commit: "Implement resume editor form"

**TECHNOLOGIES:** React Hook Form, @hookform/resolvers, Zod

---

### PHASE 11: RESUME TEMPLATE & PREVIEW

**GOAL:** Create resume template and live preview

**STEPS:**

1. Create Classic template (packages/shared/src/templates/ClassicTemplate.tsx):
   - React component accepting ResumeContent as props
   - Styled with Tailwind CSS
   - Single-column layout
   - Professional typography
   - Designed for Letter size (8.5" x 11")
2. Create template registry (packages/shared/src/templates/index.ts)
3. Build shared package
4. Create preview component (components/editor/ResumePreview.tsx):
   - Accept resume content and template ID as props
   - Render selected template
   - Container styled like paper
5. Update EditorPage layout:
   - Desktop: Form 60% left, Preview 40% right
   - Mobile: Tabs to switch between views
   - Preview updates in real-time
6. Test preview thoroughly
7. Commit: "Implement resume template and preview"

**TECHNOLOGIES:** React, Tailwind CSS, shared package

---

### PHASE 14: PDF EXPORT BACKEND

**GOAL:** Implement server-side PDF generation

**STEPS:**

1. Create PDF service (services/pdf.service.ts):
   - Render template to HTML with react-dom/server
   - Launch Puppeteer browser
   - Generate PDF
   - Return buffer
2. Create PDF routes (routes/pdf.routes.ts)
3. Test PDF generation
4. Commit: "Implement PDF export backend"

**TECHNOLOGIES:** Puppeteer, react-dom/server

---

### PHASE 15: PDF EXPORT FRONTEND

**GOAL:** Add export functionality to UI

**STEPS:**

1. Create export hook (hooks/useExportPDF.ts)
2. Add export button to editor header
3. Test PDF export
4. Commit: "Implement PDF export frontend"

**TECHNOLOGIES:** React, Blob API

---

### PHASE 16: TESTING SETUP

**GOAL:** Add Jest testing for critical paths

**STEPS:**

1. Set up Jest for shared package
2. Write schema validation tests
3. Set up Jest for backend
4. Write backend tests (auth, CRUD, AI middleware)
5. Set up Jest for frontend
6. Write frontend tests (components, hooks)
7. Run all tests
8. Commit: "Add Jest testing"

**TECHNOLOGIES:** Jest, React Testing Library, Supertest

**COVERAGE GOAL:** 40-60%

---

### PHASE 17: DOCKER SETUP

**GOAL:** Containerize application

**STEPS:**

1. Create production Dockerfile (multi-stage)
2. Update server to serve static files in production
3. Create .dockerignore
4. Build Docker image locally
5. Test Docker image
6. Commit: "Add Docker configuration"

**TECHNOLOGIES:** Docker, Chromium

---

### PHASE 18: AWS SETUP

**GOAL:** Prepare AWS resources

**STEPS:**

1. Create RDS PostgreSQL instance
2. Store secrets in AWS Secrets Manager
3. Create ECR repository
4. Create ECS task definition
5. Create ECS service
6. Update ALB
7. Set up DNS
8. Run database migrations
9. Verify setup

**TECHNOLOGIES:** AWS RDS, Secrets Manager, ECR, ECS, ALB

---

### PHASE 19: CI/CD PIPELINE

**GOAL:** Automate deployment

**STEPS:**

1. Create GitHub repository
2. Add GitHub secrets
3. Create GitHub Actions workflow
4. Test workflow
5. Commit: "Add GitHub Actions CI/CD"

**TECHNOLOGIES:** GitHub Actions, AWS CLI

---

### PHASE 22: POLISH & REFINEMENTS

**GOAL:** Final touches

**STEPS:**

1. Add loading states
2. Improve error handling
3. Add toast notifications
4. Improve mobile responsiveness
5. Add empty states
6. Improve accessibility
7. Add confirmation dialogs
8. Performance optimization
9. Test on different browsers
10. Complete flow testing
11. Commit: "Polish UI and fix bugs"

---

### PHASE 23: DOCUMENTATION

**GOAL:** Create comprehensive docs

**STEPS:**

1. Update README.md
2. Add code comments
3. Document API endpoints (optional)
4. Create demo media
5. Add to portfolio website
6. Commit: "Update documentation"

---

### PHASE 24: LAUNCH PREPARATION

**GOAL:** Final checks

**STEPS:**

1. Security review
2. Performance testing
3. Cost monitoring setup
4. Monitoring setup
5. Create admin account
6. Final deployment
7. Final production testing
8. Add to portfolio
9. Update LinkedIn
10. Announce

---

### PART II – POST-MVP ENHANCEMENTS (GOOGLE OAUTH + AI)

Tackle these phases only after the MVP (Part I) is live and stable. They add Google OAuth/account linking plus the Claude-powered AI experience.

---

#### Phase A: Google Cloud Console Setup

**GOAL:** Create and configure Google OAuth credentials for the upcoming backend/frontend work.

**STEPS:**

1. Create a Google Cloud project
2. Enable the Google+ API
3. Configure the OAuth Consent Screen (internal for dev, external for prod)
4. Create a Web OAuth 2.0 Client ID
5. Store the Client ID/Secret securely (e.g., `.env`, AWS Secrets Manager)
6. Update backend `.env` values (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`)
7. Smoke-test credentials with Google’s OAuth Playground if needed

**NOTE:** All actions happen at console.cloud.google.com

---

#### Phase B: Google OAuth Backend & Account Linking

**GOAL:** Extend the backend to support Google sign-in alongside existing email/password accounts.

**STEPS:**

1. Expand Passport config with `passport-google-oauth20`:
   - Exchange authorization code for profile
   - Find or create user; link `googleId` when emails match existing email/pass accounts
   - Re-evaluate `isAdmin` based on `ADMIN_EMAILS`
2. Add Google routes to `routes/auth.routes.ts`:
   - `GET /auth/google` → kick off OAuth flow
   - `GET /auth/google/callback` → handle profile, issue JWT, redirect to `CLIENT_URL/auth/callback?token=...`
3. Update account-linking docs/tests so dual-auth edge cases are covered
4. Re-test all auth permutations (email-only, Google-only, linked accounts)
5. Commit: "Add Google OAuth + account linking"

**TECHNOLOGIES:** Passport.js, passport-google-oauth20, passport-jwt, jsonwebtoken, bcrypt, Zod

---

#### Phase C: Google OAuth UI & Callback Flow

**GOAL:** Surface Google sign-in on the frontend once the backend is ready.

**STEPS:**

1. Add a Google OAuth button to `AuthPage` that redirects to `/auth/google`
2. Re-introduce the "Or continue with" divider when the button is visible
3. Create `pages/AuthCallbackPage.tsx`:
   - Read the `token` query param from the redirect
   - Call `login(token)` and fetch `/auth/me`
   - Navigate to `/dashboard`
4. Register the `/auth/callback` route in `App.tsx`
5. Add integration tests for Google success and failure cases
6. Commit: "Add Google OAuth UI"

**TECHNOLOGIES:** React, React Router, React Hook Form, Tailwind CSS

---

#### Phase D: Anthropic API Setup

**GOAL:** Securely provision Claude API access before building AI features.

**STEPS:**

1. Create an Anthropic account at console.anthropic.com
2. Add billing information
3. Create an API key
4. Store the key securely (local `.env`, AWS Secrets Manager, etc.)
5. Update backend config and deploy infrastructure with the new secret

**MODEL:** claude-sonnet-4-20250514 (update as Anthropic releases new recommended versions)

---

#### Phase E: AI Integration Backend

**GOAL:** Implement AI bullet improvements with usage limits once the MVP is live.

**STEPS:**

1. Create AI service (`services/ai.service.ts`):
   - Initialize Anthropic SDK client
   - `improveBulletPoint(bullet: string)` method
   - Call Claude API (model: claude-sonnet-4-20250514)
   - Handle API errors gracefully
2. Create AI usage middleware (`middleware/aiLimit.middleware.ts`):
   - `checkAILimit` (skip if dev or admin)
   - `trackAIUsage` (increment counters after successful calls)
3. Create AI routes (`routes/ai.routes.ts`):
   - `POST /api/ai/improve-bullet`
   - `GET /api/ai/usage`
4. Update main server file to mount the routes with auth + middleware
5. Test AI endpoints (happy path, limit reached, admin bypass)
6. Commit: "Implement AI integration backend"

**TECHNOLOGIES:** @anthropic-ai/sdk, Passport JWT middleware, Prisma

---

#### Phase F: AI Integration Frontend

**GOAL:** Build the UI for AI improvements once the backend and limits are in place.

**STEPS:**

1. Create AI usage hook (`hooks/useAIUsage.ts`)
2. Create AI usage indicator component (shows remaining calls/status)
3. Create AI improve button component for each bullet
4. Create AI improvement modal (before/after compare + accept/regenerate/cancel)
5. Integrate the button + modal into `WorkExperienceForm`
6. Create mutation hook (`hooks/useAIImprove.ts`) with TanStack Query
7. Test the full AI flow plus limit messaging
8. Commit: "Implement AI integration frontend"

**TECHNOLOGIES:** React, TanStack Query, Tailwind CSS

---

## TROUBLESHOOTING GUIDE

### COMMON ISSUES

**Prisma Client not found**

- Run `pnpm prisma:generate`

**CORS errors**

- Check CLIENT_URL environment variable
- Verify CORS configuration

**Authentication not working**

- Verify JWT_SECRET is set
- Check token in localStorage
- Verify middleware applied

**AI limits not enforcing**

- Check date comparison logic
- Verify middleware order
- Check isAdmin flag

**PDF generation fails**

- Verify Chromium installed
- Check Puppeteer executable path
- Verify template renders

**Deployment fails**

- Check AWS credentials
- Verify ECR repository exists
- Review CloudWatch logs

---

## SUCCESS CRITERIA

**MVP**

- ✅ Users can register/login with email + password
- ✅ Users can create/edit/delete resumes
- ✅ Resume editor has all sections working
- ✅ Live preview updates in real-time
- ✅ PDF export generates perfect PDFs
- ✅ Application deployed at custom domain
- ✅ CI/CD pipeline auto-deploys
- ✅ All tests pass
- ✅ Documentation complete

**Post-MVP Enhancements**

- ✅ Google OAuth + account linking works end-to-end
- ✅ AI improvement works with usage limits
- ✅ Admin users have unlimited AI

---

## TIMELINE SUMMARY

**ESTIMATED TOTAL:** 70-90 hours

**BREAKDOWN:**

- Backend: 30-35 hours
- Frontend: 25-30 hours
- DevOps: 10-15 hours
- Testing & Polish: 5-10 hours

**CALENDAR TIME:**

- Full-time (6-8 hrs/day): 2-3 weeks
- Part-time (3-4 hrs/day): 4-5 weeks

---

## FINAL NOTES

**DEVELOPMENT APPROACH:**

- Follow phases sequentially
- Test thoroughly after each phase
- Commit after completing each phase
- Don't skip steps
- Ask Claude for help with specific implementations

**WHEN STUCK:**

- Re-read phase instructions
- Check troubleshooting guide
- Review logs (CloudWatch/browser)
- Ask Claude for specific code examples

**QUALITY OVER SPEED:**

- Fewer polished features > many buggy ones
- Test thoroughly before moving on
- Don't cut corners on security
- Write clean, maintainable code

**COST MANAGEMENT:**

- Monitor AWS costs regularly
- Set up billing alerts
- Typical cost: $35-70/month while running

**PORTFOLIO IMPACT:**

- Professional-grade application
- Modern full-stack skills
- AI integration
- DevOps knowledge
- Custom domain + CI/CD
- Will impress hiring managers

---

END OF IMPLEMENTATION GUIDE
