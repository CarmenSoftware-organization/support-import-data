# PRD: Excel to PostgreSQL Import Tool

## Overview
A Next.js web application for importing data from Excel files into an existing PostgreSQL database. The app connects to your database, introspects the schema, and allows users to map Excel columns to database table columns with validation and preview before import.

**Key Features**:
- **Basic Import**: Single-table imports with column mapping and validation
- **Preconfiguration Wizard**: Guided multi-sheet import for complex master data with automatic relationship handling, lookup resolution, duplicate detection, and related record creation
- **Template Generation**: Download empty Excel templates matching table structure
- **Data Export**: Export existing database data to Excel format

## Goals
1. Connect to existing PostgreSQL database and read table structure
2. Upload Excel files (.xlsx, .xls) with drag-and-drop
3. Support multiple worksheets in a single Excel file
4. Map Excel columns to database table columns
5. Validate data and preview with error highlighting before import
6. Import data directly to existing tables
7. Download Excel templates based on table structure
8. Export existing data to Excel
9. **Preconfiguration Wizard**: Guided import of pre-configured master data with multi-sheet mapping, advanced validation, and relationship handling

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

### Preconfiguration Wizard Flow
The Preconfiguration Wizard provides a guided, step-by-step import process for master data using a pre-structured Excel file (Preconfig.xlsx) with advanced features like lookup handling, duplicate detection, and table truncation.

**Use Case**: Initial system setup importing interdependent master data (currencies, units, tax profiles, delivery points, departments, locations, item groups, products).

**Flow**:
1. **Upload Phase**:
   - User navigates to `/preconfig/wizard`
   - User uploads the `Preconfig.xlsx` file via drag-and-drop or file browser
   - System parses file and detects available sheets
   - Creates import steps only for sheets found in the file
   - Automatically advances to Step 1

2. **Wizard Navigation**:
   - Sidebar displays all import steps with status indicators
   - Each step shows: status icon, display name, target table, and import count (when completed)
   - User can navigate between steps by clicking in sidebar or using Previous/Next buttons
   - Status indicators: pending (circle), validating (spinner), validated (warning), completed (green checkmark), skipped (skip icon), error (red X)

3. **Per-Step Processing** (for each sheet):

   a. **Configuration Section**:
   - **Truncate Option**: Toggle to clear existing table data before import
     - Optional CASCADE toggle for cascading deletes to related tables
     - Shows count of rows that will be deleted
     - Warning message about permanent data deletion

   b. **Feature Info Cards** (when applicable):
   - **Auto-Lookup Info**: Displays configured lookup relationships
     - Shows which Excel columns will be looked up in which database tables
     - Indicates if missing records will be auto-created
   - **Unique Check Info**: Shows duplicate detection configuration
     - Displays which columns are checked for duplicates
     - Shows mode: skip, error, or upsert

   c. **Column Mapping**:
   - Table displaying Excel columns and their database mappings
   - Shows sample values from first 3 rows of Excel data
   - Dropdown selectors to modify column mappings if needed
   - Support for unmapped columns (excluded from import)

   d. **Validation**:
   - User clicks "Validate" button
   - System performs comprehensive validation:
     - Type checking (string, number, date, boolean, UUID, JSON)
     - Required field validation
     - String length constraints
     - Lookup existence checking
     - Duplicate detection (within file and against database)
   - Results displayed in scrollable table with filters:
     - All rows / Valid only / Errors only / Duplicates only
     - Each row shows: row number, status icon, data preview, error messages
     - Color coding: green (valid), red (error), orange (skip duplicate)

   e. **Import**:
   - "Import {N} Rows" button enabled only for valid data
   - User clicks to execute import
   - System performs:
     - Optional table truncation (if enabled)
     - Lookup resolution with auto-creation of missing records
     - Insertion of valid rows
     - Creation of related records in other tables (e.g., unit conversions)
     - Duplicate handling (skip, error, or upsert based on configuration)
   - Shows import summary: rows inserted, updated, skipped, related records created
   - Step marked as "completed" with import count
   - Automatically advances to next step

   f. **Skip Option**:
   - User can click "Skip" to bypass current step without importing
   - Step marked as "skipped" and wizard moves to next step

4. **Completion**:
   - After all steps are completed or skipped
   - Shows success message with total imported rows across all tables
   - Options to import another file or return to home

**Key Features**:
- **Multi-Sheet Support**: Handles multiple interdependent sheets in order
- **Advanced Validation**: Type checking, required fields, lookups, duplicates
- **Auto-Lookup & Create**: Automatically resolves foreign keys and creates missing lookup records
- **Duplicate Handling**: Three modes - skip, error, or upsert existing records
- **Related Record Creation**: Automatically inserts related records (e.g., unit conversions for products)
- **Table Truncation**: Optional data clearing with cascade support
- **Default Values**: Static and dynamic defaults (e.g., CURRENT_TIMESTAMP)
- **Progress Tracking**: Visual status for each step with import counts
- **Error Recovery**: Can retry validation or skip problematic steps
- **Comprehensive Reporting**: Detailed counts and error messages

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
- Lookup validation (foreign key references exist)
- Duplicate detection (within file and against database)

### Project Structure
```
/app
  /page.tsx                       # Dashboard - table list
  /config/page.tsx                # Database configuration page
  /import/[table]/page.tsx        # Import wizard for specific table
  /export/[table]/page.tsx        # Export page
  /preconfig
    /wizard/page.tsx              # Preconfiguration wizard
  /api
    /config/route.ts              # Get/Save/Delete config
    /config/test/route.ts         # Test connection
    /tables/route.ts              # List all tables
    /tables/[table]/route.ts      # Get table schema
    /schemas/route.ts             # List database schemas
    /parse/route.ts               # Parse uploaded Excel
    /import/route.ts              # Execute import
    /import-with-lookup/route.ts  # Advanced import with lookups
    /truncate/route.ts            # Truncate table
    /export/route.ts              # Export to Excel
    /template/[table]/route.ts    # Download template
/components
  /ui/                            # shadcn/ui components
  /FileUploader.tsx               # Drag-and-drop upload
  /SheetSelector.tsx              # Select worksheet
  /ColumnMapper.tsx               # Map columns
  /DataPreview.tsx                # Preview with validation
  /TableList.tsx                  # List of database tables
/lib
  /config.ts                      # Configuration management
  /db.ts                          # Database connection and queries
  /excel.ts                       # Excel parsing and generation
  /validation.ts                  # Data validation utilities
  /types.ts                       # TypeScript types
  /preconfig-mapping.ts           # Preconfiguration step definitions
/sample data
  /Preconfig.xlsx                 # Sample preconfiguration file
```

### Preconfiguration Wizard - Advanced Features

The Preconfiguration Wizard extends the basic import functionality with sophisticated features for handling complex, interdependent master data.

#### 1. Auto-Lookup with Creation
**Purpose**: Automatically resolve foreign key relationships by looking up values in related tables.

**Configuration**:
```typescript
{
  sourceColumn: string;           // Excel column containing lookup value
  targetColumn: string;           // Database column to store foreign key
  lookupTable: string;            // Table to search for matching record
  lookupColumn: string;           // Column in lookup table to match against
  lookupResultColumn: string;     // Column to retrieve (usually 'id')
  createIfNotFound?: boolean;     // Auto-create missing records
  createColumns?: ColumnMapping[]; // Columns to use when creating records
}
```

**Behavior**:
- Fetches and caches lookup table data at start of validation/import
- For each row, searches lookup table for matching value
- If found, uses the foreign key ID in the import
- If not found and `createIfNotFound: true`, creates new record in lookup table
- Updates cache with newly created records for subsequent rows
- Filters out soft-deleted records (`deleted_at IS NOT NULL`)

**Example**: Store Location import looks up Delivery Point by name. If delivery point doesn't exist, creates it automatically before importing the location.

#### 2. Duplicate Detection & Handling
**Purpose**: Detect duplicate records and handle them according to specified strategy.

**Configuration**:
```typescript
{
  columns: string[];              // Column(s) to check for duplicates
  mode: 'skip' | 'error' | 'upsert'; // Handling strategy
}
```

**Modes**:
- **skip**: Silently skip duplicate rows, don't count as errors (default for Preconfig)
- **error**: Report duplicates as validation errors, block import
- **upsert**: Update existing records instead of skipping

**Behavior**:
- Checks for duplicates in both database and current import file
- Supports composite keys (multiple columns)
- Skipped duplicates shown in validation results with orange "Skip" badge
- For upsert mode, executes UPDATE instead of INSERT for existing records

**Example**: Currency import skips currencies with duplicate codes. Product import could upsert to update existing products.

#### 3. Default Values
**Purpose**: Provide default values for columns not present in Excel data.

**Configuration**:
```typescript
{
  dbColumn: string;               // Database column to populate
  defaultValue: string;           // Static value or special keyword
}
```

**Special Keywords**:
- `CURRENT_TIMESTAMP`: Uses current date/time for timestamp fields

**Example**: Currency's `exchange_rate_at` field defaults to current timestamp even though not in Excel.

#### 4. Related Record Insertion
**Purpose**: Automatically create records in related tables after main record insertion.

**Configuration**:
```typescript
{
  tableName: string;              // Related table to insert into
  condition?: {                   // Optional: only insert if conditions met
    sourceColumns: string[];      // Excel columns that must have values
  };
  columns: RelatedColumnConfig[]; // Column mappings for related record
}

// Related column sources:
// - 'parent_id': ID of the just-inserted parent record
// - 'static': Static value
// - 'excel': Value from Excel column
// - 'lookup': Value from a lookup result
```

**Example**: Product import creates unit conversion records in `tb_unit_conversion` table:
- For order unit conversion (if Order Unit and Order Conv. Rate columns have values)
- For inventory unit conversion (if Inventory Unit and Inventory Conv. Rate have values)
- For sales unit conversion (if Sales Unit and Sales Conv. Rate have values)

#### 5. Table Truncation
**Purpose**: Clear existing data before import for clean slate.

**Features**:
- Optional per-step toggle
- Shows count of rows to be deleted
- **CASCADE option**: Automatically deletes dependent records in related tables
- Executes `TRUNCATE TABLE` SQL command
- Warning message about permanent deletion

**Use Case**: Refreshing master data or fixing import errors by reimporting from scratch.

#### 6. Multi-Sheet Import Order
**Purpose**: Import sheets in dependency-aware order.

**Preconfig.xlsx Import Order**:
1. Currency (no dependencies)
2. Unit (no dependencies)
3. Tax Profile (no dependencies)
4. Delivery Point (no dependencies)
5. Department (no dependencies)
6. Product Category (no dependencies)
7. Store Location (depends on Delivery Point)
8. Product Subcategory (depends on Product Category)
9. Item Group (depends on Product Subcategory)
10. Product (depends on Unit, Item Group, Tax Profile)

**Configuration**: Defined in `lib/preconfig-mapping.ts` with `PRECONFIG_STEPS` array specifying order and dependencies.

#### 7. Validation & Import Phases
**Two-Phase Process**:

**Phase 1: Validation** (`skipInvalid: false`)
- Validates all rows against rules
- Performs lookup validation
- Checks for duplicates
- Returns detailed validation results
- Stops on first error
- No data modification

**Phase 2: Import** (`skipInvalid: true`)
- Imports only valid rows
- Skips invalid rows (if any slipped through)
- Handles duplicates per mode
- Creates lookup records if needed
- Inserts related records
- Returns comprehensive import summary

**Import Summary**:
```typescript
{
  success: boolean;
  importedCount: number;         // Total rows processed
  insertedCount: number;         // New records created
  updatedCount: number;          // Existing records updated (upsert)
  relatedInsertedCount: number;  // Related records created
  skippedCount: number;          // Invalid rows skipped
  duplicateSkipped: number;      // Duplicates skipped
  dbErrors: string[];            // Database errors encountered
  message: string;               // Human-readable summary
}
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
- `POST /api/import-with-lookup` - Advanced import with lookup resolution, unique checks, default values, and related inserts
- `POST /api/truncate` - Truncate table data (optional cascade to related tables)
- `GET /api/export?table=xxx` - Export table data to Excel
- `GET /api/template/[table]` - Download empty Excel template

### Schemas
- `GET /api/schemas` - List all available database schemas

## Non-Goals (Out of Scope)
- User authentication (single user app)
- Import history tracking
- Scheduled/automated imports
- Database schema modifications
- Support for other databases (MySQL, SQLite, etc.)

## Sample Data Files

### Preconfig.xlsx
Location: `/sample data/Preconfig.xlsx`

A pre-structured Excel template demonstrating the expected format for preconfiguration imports. Contains 10 worksheets with sample master data:

| Sheet Name | Target Table | Description | Key Features |
|---|---|---|---|
| Currency | tb_currency | Currency definitions | Code, Name, Symbol, Exchange Rate |
| Unit | tb_unit | Units of measurement | Code, Description |
| Tax Profile | tb_tax_profile | Tax configurations | Name, Value |
| Delivery Point | tb_delivery_point | Delivery locations | Code |
| Department | tb_department | Organization departments | Code, Description |
| Store Location | tb_location | Storage locations | Auto-creates delivery points via lookup |
| Item Group | Multiple tables | Category hierarchy | Creates categories, subcategories, and item groups |
| Product list | tb_product | Product master data | Creates products with unit conversions |

**Purpose**:
- Serves as template for users setting up their own configuration files
- Demonstrates column structure and data format requirements
- Shows relationships between sheets (e.g., Location depends on Delivery Point)
- Includes sample data for testing the import wizard

**Import Order**: Sheets are imported in dependency-aware order:
1. Independent tables first (Currency, Unit, Tax Profile, Delivery Point, Department)
2. Dependent tables next (Store Location, Item Group hierarchy, Product)

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
8. **Preconfiguration Wizard**:
   - Can upload Preconfig.xlsx and detect all available sheets
   - Step-by-step wizard guides through each sheet import
   - Auto-lookup resolves foreign keys and creates missing records
   - Duplicate detection works correctly across all modes (skip/error/upsert)
   - Related records (e.g., unit conversions) are created automatically
   - Table truncation with cascade works safely
   - Validation shows clear errors and duplicate indicators
   - Import summary provides accurate counts and messages
   - Can skip steps and navigate between steps freely
   - Successfully imports all interdependent master data in correct order
