# GS Hub BPSC PYQ Portal - Backend

This document provides an overview of the backend architecture for the GS Hub BPSC PYQ Portal.

## Overview

The backend is a Node.js/TypeScript application built with Express.js that provides RESTful APIs for the frontend application. It handles authentication, quiz management, user data, payments, and administrative functions.

## Technology Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Authentication**: Clerk (integrated with Supabase)
- **Payments**: Razorpay (for premium subscriptions)
- **Build**: TypeScript compiler (`tsc`)

## Key Features

1. **Authentication & Authorization**
   - Clerk integration for user signup/login (email, Google, phone OTP)
   - Automatic profile creation in Supabase on user sign-up
   - Role-based access control (student/admin) via Supabase Row Level Security
   - Protected routes requiring authentication

2. **Quiz Management**
   - Quiz creation and retrieval with filtering by subject/topic/exam
   - Practice mode (immediate feedback) and exam mode (timed)
   - Answer submission and scoring
   - Browser + database auto-save with crash recovery

3. **Content Management**
   - Bilingual question support (English/Hindi)
   - Rich text content (HTML) for questions and solutions
   - Excel/CSV bulk upload for questions
   - Question tagging (difficulty, themes, high priority, dropped status)

4. **Learning Features**
   - Mistake Notebook: automatic tracking of wrong answers
   - Bookmarking system for questions
   - Heat map data for subject/topic performance
   - Dashboard analytics (streaks, accuracy trends)

5. **Admin Functionality**
   - Question CRUD operations with rich-text editor
   - Analytics dashboard (user stats, DAU, most-missed questions)
   - Bulk question upload via Excel/CSV
   - Taxonomy management (exams, subjects, topics)
   - Marking scheme configuration (+/- marks, time per question)
   - Feedback management system

6. **Payment & Premium Features**
   - Razorpay integration for payment processing
   - Secure webhook handling for payment verification
   - Automatic premium tier assignment upon successful payment
   - Protected premium content/routes

## API Structure

All API endpoints are prefixed with `/api/` and organized by feature:

- `/api/taxonomy` - exam/subject/topic management
- `/api/profile` - user profile operations
- `/api/quiz` - quiz creation and management
- `/api/user` - user-specific operations
- `/api/admin` - admin-only analytics and management
- `/api/razorpay` - payment processing and webhook handling
- `/api/challenge` - challenge system
- `/api/live-exam` - live exam functionality
- `/api/webhooks/razorpay` - Razorpay webhook endpoint (POST)
- `/health` - health check endpoint

## Environment Variables

See `.env.example` for required configuration. Key variables include:

- `PORT` - Server port (default 8000)
- `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` - Supabase project credentials
- `SUPABASE_ANON_KEY` - Public Supabase key (for client-side usage)
- `CLERK_PUBLISHABLE_KEY`/`CLERK_SECRET_KEY` - Clerk authentication keys
- `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`/`RAZORPAY_WEBHOOK_SECRET` - Razorpay payment credentials
- `FRONTEND_URL` - Frontend URL for CORS configuration

## Database Schema

The backend uses Supabase for data persistence. The schema is defined in the Supabase migrations:
- `../gshub-frontend/supabase/migrations/001_schema.sql` - Core schema
- Subsequent migrations (`002_*.sql` through `012_*.sql`) - Feature additions

Key tables include:
- `public.profiles` - User metadata (role, preferred language)
- `public.exams` - Examination metadata
- `public.subjects`/`public.topics` - Academic taxonomy
- `public.questions` - Main content table with bilingual support
- `public.quiz_attempts` - User quiz sessions
- `public.attempt_answers` - Individual question responses
- `public.bookmarks`/`public.mistakes` - User-specific tracking
- `public.feedback` - User feedback/feature requests
- `public.app_settings` - Global configuration (marking scheme, timing)

## Security

- Row Level Security enabled on all Supabase tables
- Users restricted to own data except for public-readable content
- Admin privileges required for write access to taxonomy/questions/settings
- Sensitive operations (scoring, mistake tracking) via security-definer RPCs
- Environment variables never committed (see `.env.example`)

## Development

### Setup
1. Copy `.env.example` to `.env` and fill in required values
2. Install dependencies: `npm install`
3. Start development server: `npm run dev` (runs `tsc` and starts `node dist/index.js`)
4. For production build: `npm run build` then `npm start`

### Type Checking
- TypeScript compilation is part of the build process
- Explicit type checking: n/a (compilation errors prevent build)

## Deployment

- **Frontend**: Designed for Vercel deployment (see frontend README)
- **Backend**: Standard Node.js executable output
- Environment-specific configuration via `.env` files
- Database migrations managed via Supabase CLI