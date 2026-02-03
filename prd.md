# PRD: Excel to PostgreSQL Import Tool

## Overview
A Next.js web application for importing data from Excel files into an existing PostgreSQL database. The app connects to your database, introspects the schema, and allows users to map Excel columns to database table columns with validation and preview before import.

## Goals
1. Connect to existing PostgreSQL database and read table structure
2. Upload Excel files (.xlsx, .xls) with drag-and-drop
3. Support multiple worksheets in a single Excel file
4. Map Excel columns to database table columns
5. Validate data and preview with error highlighting before import
6. Import data directly to existing tables
7. Download Excel templates based on table structure
8. Export existing data to Excel

## User Flow

### Import Flow
1. User opens the app and sees list of available database tables
2. User selects target table for import
3. User uploads Excel file (drag-and-drop or click to browse)
4. If multiple sheets exist, user selects which sheet to import
5. App shows column mapping interface:
   - Left side: Excel columns with sample data
   - Right side: Database columns with data types
   - User maps each Excel column to a database column
6. App validates all rows and shows preview:
   - Valid rows highlighted in green
   - Invalid rows highlighted in red with error messages
7. User can choose to:
   - Import all valid rows
   - Fix errors and re-upload
   - Cancel import
8. On confirm, data is imported to the database
9. Summary shows: rows imported, rows skipped, errors

### Export Flow
1. User selects a table to export
2. User can optionally filter/select columns
3. App generates Excel file for download

### Template Download Flow
1. User selects a table
2. App generates empty Excel file with column headers matching table structure
3. User downloads template to fill in data

### Configuration Flow
1. User navigates to Settings page
2. User enters PostgreSQL connection details (host, port, database, username, password)
3. User can test connection before saving
4. Configuration is saved locally (db-config.json)
5. App uses saved configuration to connect to database

## Technical Specifications

### Tech Stack
- **Runtime**: Bun
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL (existing database)
- **DB Client**: pg (node-postgres) for direct queries and introspection
- **Excel Processing**: xlsx (SheetJS)
- **UI**: Tailwind CSS + shadcn/ui
- **File Upload**: react-dropzone

### Database Connection
- Connection can be configured via:
  1. **Settings page** (recommended): UI form to enter host, port, database, username, password
  2. **Environment variable**: `DATABASE_URL` as fallback
- Configuration is stored in `db-config.json` (gitignored for security)
- App introspects database to get:
  - List of tables
  - Column names and data types
  - Primary keys and constraints
  - Required vs nullable columns

### Supported Data Types
- String/Text (varchar, text, char)
- Numbers (integer, bigint, decimal, numeric, real, double precision)
- Boolean
- Date/DateTime (date, timestamp, timestamptz)
- UUID
- JSON/JSONB

### Validation Rules
- Required columns must have values
- Data types must match (numbers, dates, etc.)
- String length constraints
- Unique constraints checked before import

### Project Structure
```
/app
  /page.tsx                    # Dashboard - table list
  /config/page.tsx             # Database configuration page
  /import/[table]/page.tsx     # Import wizard for specific table
  /export/[table]/page.tsx     # Export page
  /api
    /config/route.ts           # Get/Save/Delete config
    /config/test/route.ts      # Test connection
    /tables/route.ts           # List all tables
    /tables/[table]/route.ts   # Get table schema
    /parse/route.ts            # Parse uploaded Excel
    /import/route.ts           # Execute import
    /export/route.ts           # Export to Excel
    /template/[table]/route.ts # Download template
/components
  /ui/                         # shadcn/ui components
  /FileUploader.tsx            # Drag-and-drop upload
  /SheetSelector.tsx           # Select worksheet
  /ColumnMapper.tsx            # Map columns
  /DataPreview.tsx             # Preview with validation
  /TableList.tsx               # List of database tables
/lib
  /config.ts                   # Configuration management
  /db.ts                       # Database connection and queries
  /excel.ts                    # Excel parsing and generation
  /validation.ts               # Data validation utilities
  /types.ts                    # TypeScript types
```

## API Endpoints

### Configuration
- `GET /api/config` - Get current configuration status
- `POST /api/config` - Save new configuration
- `DELETE /api/config` - Remove configuration
- `POST /api/config/test` - Test connection without saving

### Tables
- `GET /api/tables` - List all tables in the database
- `GET /api/tables/[table]` - Get schema for specific table

### Import/Export
- `POST /api/parse` - Parse uploaded Excel file
- `POST /api/import` - Validate and import data to table
- `GET /api/export?table=xxx` - Export table data to Excel
- `GET /api/template/[table]` - Download empty Excel template

## Non-Goals (Out of Scope)
- User authentication (single user app)
- Import history tracking
- Scheduled/automated imports
- Database schema modifications
- Support for other databases (MySQL, SQLite, etc.)

## Environment Variables (Optional)
```
DATABASE_URL=postgresql://user:password@host:port/database
```
Note: Environment variable is optional. Database can be configured via the Settings page.

## Success Criteria
1. Can connect to any PostgreSQL database and list tables
2. Can upload Excel file and see all sheets
3. Can map columns intuitively with type hints
4. Validation catches type mismatches and required fields
5. Import successfully adds rows to database
6. Export downloads valid Excel file
7. Templates match table structure exactly
