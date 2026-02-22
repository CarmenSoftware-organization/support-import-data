import { ColumnMapping } from './types';

export interface LookupConfig {
  sourceColumn: string;      // Excel column name
  targetColumn: string;      // DB column to set (e.g., delivery_point_id)
  lookupTable: string;       // Table to lookup from (e.g., tb_delivery_point)
  lookupColumn: string;      // Column to match (e.g., name)
  lookupResultColumn: string; // Column to get value from (e.g., id)
  createIfNotFound?: boolean; // If true, create a new record if lookup fails
}

export interface UniqueCheckConfig {
  columns: string[];           // DB columns to check for uniqueness
  mode: 'skip' | 'error' | 'upsert';  // skip = skip duplicates, error = report as error, upsert = update existing
}

export interface RelatedInsertConfig {
  tableName: string;           // Table to insert into (e.g., tb_unit_conversion)
  condition?: {                // Only insert if these columns have values
    sourceColumns: string[];   // Excel columns that must have values
  };
  columns: {
    dbColumn: string;          // Column in the related table
    source: 'excel' | 'lookup' | 'static' | 'parent_id';  // Where to get the value
    excelColumn?: string;      // If source is 'excel', the Excel column name
    lookupConfig?: {           // If source is 'lookup'
      sourceColumn: string;    // Excel column to lookup
      lookupTable: string;
      lookupColumn: string;
      lookupResultColumn: string;
    };
    staticValue?: string | number | boolean;  // If source is 'static'
  }[];
}

export interface ColumnMappingConfig {
  excelColumn: string;
  dbColumn: string;
  defaultValue?: string | 'CURRENT_TIMESTAMP';  // Static value or special keyword
}

export interface PreconfigStep {
  id: string;
  sheetName: string;
  tableName: string;
  displayName: string;
  description: string;
  columnMappings: ColumnMappingConfig[];
  lookups?: LookupConfig[];
  uniqueCheck?: UniqueCheckConfig;
  relatedInserts?: RelatedInsertConfig[];
  connectionId?: string; // Optional: specify which database connection to use (defaults to 'main')
}

// Predefined mapping configuration for Preconfig.xlsx
// Based on actual database schema in T01
export const PRECONFIG_STEPS: PreconfigStep[] = [
  {
    id: 'company-profile',
    sheetName: 'Company Profile',
    tableName: 'tb_business_unit',
    displayName: 'Business Unit / Company Profile',
    description: 'Business unit information (imports to CARMEN_SYSTEM schema)',
    connectionId: '814666ba-8ef7-44c3-bc0e-d892cd56b348', // SYSTEM connection (CARMEN_SYSTEM schema)
    columnMappings: [
      { excelColumn: 'BU Code', dbColumn: 'code' },
      { excelColumn: 'Hotel Name', dbColumn: 'hotel_name' },
      { excelColumn: 'Hotel Tel', dbColumn: 'hotel_tel' },
      { excelColumn: 'Hotel Email', dbColumn: 'hotel_email' },
      { excelColumn: 'Hotel Address', dbColumn: 'hotel_address' },
      { excelColumn: 'Hotel Zip Code', dbColumn: 'hotel_zip_code' },
      { excelColumn: 'Company Name (*Mandatory*)', dbColumn: 'company_name' },
      { excelColumn: 'Company  Tel', dbColumn: 'company_tel' },
      { excelColumn: 'Company  Email', dbColumn: 'company_email' },
      { excelColumn: 'Company Address', dbColumn: 'company_address' },
      { excelColumn: 'Company  Zip Code', dbColumn: 'company_zip_code' },
      { excelColumn: 'Tax ID (*Mandatory*)', dbColumn: 'tax_no' },
      { excelColumn: 'Branch No (*Mandatory*)', dbColumn: 'branch_no' },
      { excelColumn: 'Inventory Cost Type (*Mandatory*)', dbColumn: 'inventory_cost_type' },
    ],
    uniqueCheck: {
      columns: ['code'],
      mode: 'upsert',
    },
  },
  {
    id: 'currency',
    sheetName: 'Currency',
    tableName: 'tb_currency',
    displayName: 'Currencies',
    description: 'Currency definitions (THB, USD, etc.)',
    columnMappings: [
      { excelColumn: 'Code', dbColumn: 'code' },
      { excelColumn: 'Name', dbColumn: 'name' },
      { excelColumn: 'Symbol', dbColumn: 'symbol' },
      { excelColumn: 'Exchange Rate', dbColumn: 'exchange_rate' },
      { excelColumn: '', dbColumn: 'exchange_rate_at', defaultValue: 'CURRENT_TIMESTAMP' },
    ],
    uniqueCheck: {
      columns: ['code'],
      mode: 'skip',
    },
  },
  {
    id: 'unit',
    sheetName: 'Unit',
    tableName: 'tb_unit',
    displayName: 'Units',
    description: 'Unit of measurement (BAG, BOX, KG, etc.)',
    columnMappings: [
      { excelColumn: 'Code', dbColumn: 'name' },
      { excelColumn: 'Description', dbColumn: 'description' },
    ],
    uniqueCheck: {
      columns: ['name'],
      mode: 'skip',
    },
  },
  {
    id: 'tax-profile',
    sheetName: 'Tax Profile',
    tableName: 'tb_tax_profile',
    displayName: 'Tax Profiles',
    description: 'Tax configurations (VAT, None, etc.)',
    columnMappings: [
      { excelColumn: 'Name', dbColumn: 'name' },
      { excelColumn: 'Value', dbColumn: 'tax_rate' },
    ],
    uniqueCheck: {
      columns: ['name'],
      mode: 'skip',
    },
  },
  {
    id: 'delivery-point',
    sheetName: 'Delivery Point',
    tableName: 'tb_delivery_point',
    displayName: 'Delivery Points',
    description: 'Delivery locations',
    columnMappings: [
      { excelColumn: 'Code', dbColumn: 'name' },
    ],
    uniqueCheck: {
      columns: ['name'],
      mode: 'skip',
    },
  },
  {
    id: 'department',
    sheetName: 'Department',
    tableName: 'tb_department',
    displayName: 'Departments',
    description: 'Organization departments',
    columnMappings: [
      { excelColumn: 'Code', dbColumn: 'code' },
      { excelColumn: 'Description', dbColumn: 'name' },
    ],
    uniqueCheck: {
      columns: ['code'],
      mode: 'skip',
    },
  },
  {
    id: 'location',
    sheetName: 'Store Location',
    tableName: 'tb_location',
    displayName: 'Store Locations',
    description: 'Storage and inventory locations (auto-creates delivery points if not found)',
    columnMappings: [
      { excelColumn: 'Store Code', dbColumn: 'code' },
      { excelColumn: 'Store Name', dbColumn: 'name' },
      { excelColumn: 'Delivery Point', dbColumn: 'delivery_point_name' },
    ],
    lookups: [
      {
        sourceColumn: 'Delivery Point',
        targetColumn: 'delivery_point_id',
        lookupTable: 'tb_delivery_point',
        lookupColumn: 'name',
        lookupResultColumn: 'id',
        createIfNotFound: true,
      },
    ],
    uniqueCheck: {
      columns: ['code'],
      mode: 'skip',
    },
  },
  {
    id: 'product-category',
    sheetName: 'Item Group',
    tableName: 'tb_product_category',
    displayName: 'Product Categories',
    description: 'Main product categories (FOOD, BEVERAGE, etc.) - Unique by code and name',
    columnMappings: [
      { excelColumn: 'Category Code', dbColumn: 'code' },
      { excelColumn: 'Category Description', dbColumn: 'name' },
    ],
    uniqueCheck: {
      columns: ['code', 'name'],
      mode: 'skip',
    },
  },
  {
    id: 'product-subcategory',
    sheetName: 'Item Group',
    tableName: 'tb_product_sub_category',
    displayName: 'Product Subcategories',
    description: 'Product subcategories (with category lookup) - Unique by code and name',
    columnMappings: [
      { excelColumn: 'Subcategory Code', dbColumn: 'code' },
      { excelColumn: 'Subcategory Description', dbColumn: 'name' },
    ],
    lookups: [
      {
        sourceColumn: 'Category Code',
        targetColumn: 'product_category_id',
        lookupTable: 'tb_product_category',
        lookupColumn: 'code',
        lookupResultColumn: 'id',
      },
    ],
    uniqueCheck: {
      columns: ['code', 'name'],
      mode: 'skip',
    },
  },
  {
    id: 'item-group',
    sheetName: 'Item Group',
    tableName: 'tb_product_item_group',
    displayName: 'Item Groups',
    description: 'Detailed item groups (with subcategory lookup) - Unique by code and name',
    columnMappings: [
      { excelColumn: 'Item Group Code', dbColumn: 'code' },
      { excelColumn: 'Item Group Description', dbColumn: 'name' },
      { excelColumn: 'Quantity Deviation %', dbColumn: 'qty_deviation_limit' },
      { excelColumn: 'Price Deviation %', dbColumn: 'price_deviation_limit' },
      { excelColumn: 'Tax Profile', dbColumn: 'tax_profile_name' },
    ],
    lookups: [
      {
        sourceColumn: 'Subcategory Code',
        targetColumn: 'product_subcategory_id',
        lookupTable: 'tb_product_sub_category',
        lookupColumn: 'code',
        lookupResultColumn: 'id',
      },
    ],
    uniqueCheck: {
      columns: ['code', 'name'],
      mode: 'skip',
    },
  },
  {
    id: 'product',
    sheetName: 'Product list',
    tableName: 'tb_product',
    displayName: 'Products',
    description: 'Product master data (with unit, item group, tax profile lookups) - Unique by code',
    columnMappings: [
      { excelColumn: 'Product Code', dbColumn: 'code' },
      { excelColumn: 'Description (Eng)', dbColumn: 'name' },
      { excelColumn: 'Description (Local)', dbColumn: 'local_name' },
      { excelColumn: 'Bar code', dbColumn: 'barcode' },
      { excelColumn: '(%) Qty Deviation', dbColumn: 'qty_deviation_limit' },
      { excelColumn: '(%) Price Deviation', dbColumn: 'price_deviation_limit' },
    ],
    lookups: [
      {
        sourceColumn: 'Inventory Unit',
        targetColumn: 'inventory_unit_id',
        lookupTable: 'tb_unit',
        lookupColumn: 'name',
        lookupResultColumn: 'id',
      },
      {
        sourceColumn: 'Item Group',
        targetColumn: 'product_item_group_id',
        lookupTable: 'tb_product_item_group',
        lookupColumn: 'code',
        lookupResultColumn: 'id',
      },
      {
        sourceColumn: 'Tax profile',
        targetColumn: 'tax_profile_id',
        lookupTable: 'tb_tax_profile',
        lookupColumn: 'name',
        lookupResultColumn: 'id',
      },
    ],
    uniqueCheck: {
      columns: ['code'],
      mode: 'skip',
    },
    relatedInserts: [
      {
        tableName: 'tb_unit_conversion',
        condition: {
          sourceColumns: ['Order unit', 'Order Conv. Rate'],
        },
        columns: [
          { dbColumn: 'product_id', source: 'parent_id' },
          { dbColumn: 'unit_type', source: 'static', staticValue: 'order_unit' },
          { dbColumn: 'from_unit_id', source: 'lookup', lookupConfig: {
            sourceColumn: 'Order unit',
            lookupTable: 'tb_unit',
            lookupColumn: 'name',
            lookupResultColumn: 'id',
          }},
          { dbColumn: 'from_unit_name', source: 'excel', excelColumn: 'Order unit' },
          { dbColumn: 'from_unit_qty', source: 'static', staticValue: 1 },
          { dbColumn: 'to_unit_id', source: 'lookup', lookupConfig: {
            sourceColumn: 'Inventory Unit',
            lookupTable: 'tb_unit',
            lookupColumn: 'name',
            lookupResultColumn: 'id',
          }},
          { dbColumn: 'to_unit_name', source: 'excel', excelColumn: 'Inventory Unit' },
          { dbColumn: 'to_unit_qty', source: 'excel', excelColumn: 'Order Conv. Rate' },
        ],
      },
      {
        tableName: 'tb_unit_conversion',
        condition: {
          sourceColumns: ['Recipe unit', 'Recipe Conv. Rate'],
        },
        columns: [
          { dbColumn: 'product_id', source: 'parent_id' },
          { dbColumn: 'unit_type', source: 'static', staticValue: 'recipe_unit' },
          { dbColumn: 'from_unit_id', source: 'lookup', lookupConfig: {
            sourceColumn: 'Inventory Unit',
            lookupTable: 'tb_unit',
            lookupColumn: 'name',
            lookupResultColumn: 'id',
          }},
          { dbColumn: 'from_unit_name', source: 'excel', excelColumn: 'Inventory Unit' },
          { dbColumn: 'from_unit_qty', source: 'static', staticValue: 1 },
          { dbColumn: 'to_unit_id', source: 'lookup', lookupConfig: {
            sourceColumn: 'Recipe unit',
            lookupTable: 'tb_unit',
            lookupColumn: 'name',
            lookupResultColumn: 'id',
          }},
          { dbColumn: 'to_unit_name', source: 'excel', excelColumn: 'Recipe unit' },
          { dbColumn: 'to_unit_qty', source: 'excel', excelColumn: 'Recipe Conv. Rate' },
        ],
      },
    ],
  },
  {
    id: 'vendor',
    sheetName: 'Vendor',
    tableName: 'tb_vendor',
    displayName: 'Vendors',
    description: 'Vendor/Supplier master data (with tax profile lookup and contact info)',
    columnMappings: [
      { excelColumn: 'VnCode', dbColumn: 'code' },
      { excelColumn: 'VnName', dbColumn: 'name' },
      { excelColumn: 'Active', dbColumn: 'is_active' },
      { excelColumn: 'TaxProfileCode1', dbColumn: 'tax_profile_name' },
    ],
    lookups: [
      {
        sourceColumn: 'TaxProfileCode1',
        targetColumn: 'tax_profile_id',
        lookupTable: 'tb_tax_profile',
        lookupColumn: 'name',
        lookupResultColumn: 'id',
      },
    ],
    uniqueCheck: {
      columns: ['code'],
      mode: 'skip',
    },
    relatedInserts: [
      {
        tableName: 'tb_vendor_contact',
        condition: {
          sourceColumns: ['VnPayee'],
        },
        columns: [
          { dbColumn: 'vendor_id', source: 'parent_id' },
          { dbColumn: 'name', source: 'excel', excelColumn: 'VnPayee' },
          { dbColumn: 'phone', source: 'excel', excelColumn: 'VnTel' },
          { dbColumn: 'email', source: 'excel', excelColumn: 'VnEmail' },
          { dbColumn: 'is_primary', source: 'static', staticValue: true },
        ],
      },
      {
        tableName: 'tb_vendor_contact',
        condition: {
          sourceColumns: ['Vn2Payee'],
        },
        columns: [
          { dbColumn: 'vendor_id', source: 'parent_id' },
          { dbColumn: 'name', source: 'excel', excelColumn: 'Vn2Payee' },
          { dbColumn: 'phone', source: 'excel', excelColumn: 'Vn2Tel' },
          { dbColumn: 'email', source: 'excel', excelColumn: 'Vn2Email' },
          { dbColumn: 'is_primary', source: 'static', staticValue: false },
        ],
      },
    ],
  },
];

export function getStepBySheetName(sheetName: string): PreconfigStep | undefined {
  return PRECONFIG_STEPS.find((step) => step.sheetName === sheetName);
}

export function getStepById(stepId: string): PreconfigStep | undefined {
  return PRECONFIG_STEPS.find((step) => step.id === stepId);
}

export function createColumnMappings(
  step: PreconfigStep,
  sheetColumns: string[],
  sampleRows: Record<string, unknown>[]
): ColumnMapping[] {
  return sheetColumns.map((excelCol) => {
    const predefinedMapping = step.columnMappings.find(
      (m) => m.excelColumn.toLowerCase() === excelCol.toLowerCase()
    );

    return {
      excelColumn: excelCol,
      dbColumn: predefinedMapping?.dbColumn || null,
      sampleValues: sampleRows.slice(0, 3).map((row) => row[excelCol]),
    };
  });
}

// Helper to check if a step has lookups
export function stepHasLookups(stepId: string): boolean {
  const step = getStepById(stepId);
  return (step?.lookups?.length ?? 0) > 0;
}

// Get the order of import (dependencies first)
export function getImportOrder(): string[] {
  return [
    'company-profile',  // No dependencies (separate database)
    'currency',       // No dependencies
    'unit',           // No dependencies
    'tax-profile',    // No dependencies
    'delivery-point', // No dependencies
    'department',     // No dependencies
    'product-category', // No dependencies
    'location',       // Depends on delivery-point
    'product-subcategory', // Depends on product-category
    'item-group',     // Depends on product-subcategory
    'product',        // Depends on unit
    'vendor',         // Depends on tax-profile
  ];
}
