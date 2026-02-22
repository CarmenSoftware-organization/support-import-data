# Support Import Data

A Next.js web application for importing data from Excel files into PostgreSQL databases. Supports column mapping, data validation, template generation, data export, and a guided multi-step wizard for bulk master data imports.

## Features

- **Basic Import** — Upload Excel files, map columns to database tables, validate data types, and import with preview
- **Preconfiguration Wizard** — 12-step guided import for interdependent master data (company profiles, currencies, units, tax profiles, delivery points, departments, locations, item groups, products, vendors)
- **Template Generation** — Download empty Excel templates matching any table's structure
- **Data Export** — Export database table data to Excel
- **Multi-Database** — Manage multiple PostgreSQL connections with a default selector

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Database**: PostgreSQL via `pg` (node-postgres)
- **Excel**: XLSX (SheetJS)
- **UI**: shadcn/ui (Radix UI), Tailwind CSS v4, Lucide icons, Sonner toasts
- **Runtime**: Bun

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ or [Bun](https://bun.sh/)
- A running PostgreSQL database

### Install & Run

```bash
# Install dependencies
bun install
# or
npm install

# Start development server (port 3010)
bun dev
# or
npm run dev
```

Open [http://localhost:3010](http://localhost:3010) in your browser.

### Database Configuration

Configure your database connection(s) in one of two ways:

1. **Settings page** (recommended): Navigate to `/config` in the app to add, test, and manage connections
2. **Environment variable**: Set `DATABASE_URL` as a fallback

```
DATABASE_URL=postgresql://user:password@host:port/database
```

Connection configs are stored in `db-config.json` (gitignored).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server on port 3010 |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |

## Project Structure

```
src/
├── app/
│   ├── api/                    # API routes
│   │   ├── config/             # Connection management (list, save, delete, set-default, test)
│   │   ├── import/             # Basic import
│   │   ├── import-with-lookup/ # Advanced import (lookups, upserts, related inserts, JSONB)
│   │   ├── parse/              # Excel file parsing
│   │   ├── template/[table]/   # Template generation
│   │   ├── export/             # Data export
│   │   ├── tables/             # Table listing and schema introspection
│   │   ├── schemas/            # Schema listing
│   │   └── truncate/           # Table truncation
│   ├── page.tsx                # Home — table list with connection selector
│   ├── import/[table]/         # Single-table import flow
│   ├── export/[table]/         # Export flow
│   ├── config/                 # Connection management UI
│   └── preconfig/wizard/       # Multi-step import wizard
├── components/                 # UI components (FileUploader, ColumnMapper, DataPreview, etc.)
├── lib/                        # Core logic
│   ├── db.ts                   # Connection pooling, schema introspection, queries
│   ├── config.ts               # Multi-DB connection management (UUID-based)
│   ├── validation.ts           # Data type validation and coercion
│   ├── excel.ts                # Excel parsing and generation
│   ├── preconfig-mapping.ts    # 12-step wizard configuration
│   └── types.ts                # TypeScript interfaces
└── sample data/
    └── Preconfig.xlsx          # Sample file for the wizard
```

## Sample Data

A sample `Preconfig.xlsx` file is included in `/sample data/` for testing the preconfiguration wizard. It contains sheets for all 12 import steps with sample master data.
