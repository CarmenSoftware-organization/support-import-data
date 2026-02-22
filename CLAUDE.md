# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Excel-to-PostgreSQL import tool built with Next.js. Supports single-table imports with column mapping/validation, a 12-step preconfiguration wizard for bulk master data imports, template generation, and data export. Manages multiple database connections.

## Commands

- **Dev server**: `npm run dev` (runs on port 3010)
- **Build**: `npm run build`
- **Lint**: `npm run lint` (ESLint)
- **Package manager**: Bun (`bun.lock`), but `npm` scripts work fine

No test framework is configured.

## Tech Stack

- Next.js 16 (App Router) with React 19, TypeScript strict mode
- PostgreSQL via `pg` driver (no ORM)
- XLSX library for Excel parsing/generation
- UI: shadcn/ui (Radix UI), Tailwind CSS v4, Lucide icons, Sonner toasts
- Path alias: `@/*` maps to `src/*`

## Architecture

### Data Flow

1. User uploads Excel file → `/api/parse` extracts sheets/columns/rows
2. User maps Excel columns to DB columns in the UI
3. Data is validated against DB schema types (`lib/validation.ts`)
4. Import via `/api/import` (basic) or `/api/import-with-lookup` (advanced with lookups, upserts, related inserts)

### Key Modules in `src/lib/`

- **`db.ts`** — Connection pooling (Map-based), schema introspection (`getTables`, `getTableSchema`), row insertion with transactions. All DB operations accept an optional `connectionId` to target a specific connection.
- **`config.ts`** — Multi-database connection management with UUID-based IDs. Persisted in `db-config.json` (gitignored). Supports `DATABASE_URL` env var as fallback.
- **`validation.ts`** — Type validation/coercion for PostgreSQL types (string, number, boolean, date, datetime, uuid, json). Enforces max length and required fields.
- **`types.ts`** — Core interfaces (`TableSchema`, `ColumnMapping`, `ValidationResult`, `ImportResult`) and `mapPostgresType()` for PG→app type mapping.
- **`excel.ts`** — Excel parsing and template generation.
- **`preconfig-mapping.ts`** — Defines the 12-step wizard config. Each `PreconfigStep` specifies column mappings, lookup configs (with auto-creation), unique check modes (skip/error/upsert), related insert chains, and target connection/schema.

### Advanced Import (`/api/import-with-lookup`)

The most complex API route. Handles in a single request:
- **Lookup resolution**: Caches lookup tables, case-insensitive matching, auto-creates missing lookup values when configured
- **Unique checking**: Composite key detection with skip/error/upsert modes
- **Related inserts**: Creates records in dependent tables using parent insert ID
- **JSONB field mapping**: Merges multiple Excel columns into a single JSONB column
- **Truncate-before-import**: Optional table clearing with cascade support

### Database Conventions

- Tables use `deleted_at IS NULL` for soft-delete filtering
- Schema-qualified table names (`schema.table_name`)
- Default schema is `"public"` but configurable per connection
- Connection configs migrate from legacy format automatically

### UI Components (`src/components/`)

- `FileUploader` — Drag-drop Excel upload (react-dropzone)
- `ColumnMapper` — Maps Excel columns to DB columns
- `DataPreview` — Shows data with validation error highlights
- `SheetSelector` — Multi-sheet selection for Excel files
- `TableList` — Table browser with import/export/truncate actions
- `ui/` — shadcn/ui primitives

### Page Routes

- `/` — Home: table list with connection selector
- `/import/[table]` — Single-table import flow
- `/export/[table]` — Export table to Excel
- `/config` — Database connection management
- `/preconfig/wizard` — Multi-step master data import wizard
