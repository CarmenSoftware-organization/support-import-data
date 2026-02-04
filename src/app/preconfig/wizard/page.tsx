'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Upload,
  AlertCircle,
  CheckCircle2,
  XCircle,
  SkipForward,
  Loader2,
  Trash2,
  Copy,
} from 'lucide-react';
import { FileUploader } from '@/components/FileUploader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  ParsedExcel,
  SheetData,
  TableSchema,
  ColumnMapping,
  ValidationResult,
} from '@/lib/types';
import {
  PRECONFIG_STEPS,
  PreconfigStep,
  createColumnMappings,
  getStepById,
} from '@/lib/preconfig-mapping';

interface StepStatus {
  stepId: string;
  status: 'pending' | 'ready' | 'validating' | 'validated' | 'importing' | 'completed' | 'skipped' | 'error';
  validation: ValidationResult | null;
  importedCount: number;
  truncatedCount: number;
  error: string | null;
  columnMappings: ColumnMapping[];
  truncateEnabled: boolean;
  truncateCascade: boolean;
  connectionId: string;  // Selected database connection for this step
  schema: string;        // Selected schema for this step
  progress?: {           // Import progress tracking
    current: number;
    total: number;
    message: string;
  };
}

interface Connection {
  id: string;        // UUID
  name: string;      // User-friendly display name
  schema: string;    // Default schema for this connection
}

type ValidationFilter = 'all' | 'valid' | 'error' | 'duplicate';

export default function PreconfigWizardPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [parsedExcel, setParsedExcel] = useState<ParsedExcel | null>(null);
  const [tableSchemas, setTableSchemas] = useState<Map<string, TableSchema>>(new Map());
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1); // -1 = upload step
  const [validationFilter, setValidationFilter] = useState<ValidationFilter>('all');
  const [stepStatuses, setStepStatuses] = useState<Map<string, StepStatus>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  // Available steps based on uploaded Excel
  const availableSteps = useMemo(() => {
    if (!parsedExcel) return [];
    const sheetNames = new Set(parsedExcel.sheets.map((s) => s.name));
    return PRECONFIG_STEPS.filter((step) => sheetNames.has(step.sheetName));
  }, [parsedExcel]);

  // Current step
  const currentStep = currentStepIndex >= 0 ? availableSteps[currentStepIndex] : null;
  const currentStatus = currentStep ? stepStatuses.get(currentStep.id) : null;

  // Fetch connections on mount
  useEffect(() => {
    async function fetchConnections() {
      try {
        const response = await fetch('/api/config/list');
        const data = await response.json();
        if (data.connections) {
          const connList: Connection[] = Object.entries(data.connections).map(([id, conn]: [string, any]) => ({
            id,
            name: conn.name || id,  // Use name from config, fallback to ID
            schema: conn.schema || 'public',  // Default schema for this connection
          }));
          setConnections(connList);
        }
      } catch {
        // Silently fail
      }
    }
    fetchConnections();
  }, []);

  // Fetch default schema
  // Fetch table schema with specific connection and schema
  const fetchTableSchema = async (
    tableName: string,
    schema: string,
    connectionId: string
  ): Promise<TableSchema | null> => {
    const cacheKey = `${connectionId}.${schema}.${tableName}`;
    if (tableSchemas.has(cacheKey)) {
      return tableSchemas.get(cacheKey)!;
    }

    try {
      const response = await fetch(
        `/api/tables/${tableName}?schema=${schema}&connectionId=${connectionId}`
      );
      const data = await response.json();
      if (response.ok) {
        setTableSchemas((prev) => new Map(prev).set(cacheKey, data));
        return data;
      }
    } catch {
      // Silently fail
    }
    return null;
  };

  // Get sheet data for a step
  const getSheetData = (step: PreconfigStep): SheetData | undefined => {
    return parsedExcel?.sheets.find((s) => s.name === step.sheetName);
  };

  // Save step configuration (column mappings + database config) to localStorage
  const saveStepConfig = (stepId: string, mappings: ColumnMapping[], connectionId: string, schema: string) => {
    try {
      const key = `step-config-${stepId}`;
      const configData = {
        mappings: mappings.map(m => ({
          excelColumn: m.excelColumn,
          dbColumn: m.dbColumn,
        })),
        connectionId,
        schema,
      };
      localStorage.setItem(key, JSON.stringify(configData));
    } catch (err) {
      console.error('Failed to save step configuration:', err);
    }
  };

  // Load step configuration from localStorage
  const loadStepConfig = (stepId: string): { mappings: ColumnMapping[], connectionId: string, schema: string } | null => {
    try {
      const key = `step-config-${stepId}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (err) {
      console.error('Failed to load step configuration:', err);
    }
    return null;
  };

  // Legacy: Load old column mappings (for backward compatibility)
  const loadColumnMappings = (stepId: string): ColumnMapping[] | null => {
    try {
      const key = `column-mappings-${stepId}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (err) {
      console.error('Failed to load column mappings:', err);
    }
    return null;
  };

  // Clear saved step configuration
  const clearSavedMappings = (stepId: string) => {
    try {
      // Clear new format
      const newKey = `step-config-${stepId}`;
      localStorage.removeItem(newKey);

      // Clear legacy format (for backward compatibility)
      const legacyKey = `column-mappings-${stepId}`;
      localStorage.removeItem(legacyKey);

      toast.info('Saved configuration cleared');
    } catch (err) {
      console.error('Failed to clear saved configuration:', err);
    }
  };

  // Handle file upload
  const handleFileSelect = async (file: File) => {
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/parse', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse file');
      }

      setParsedExcel(data);

      // Initialize step statuses
      const sheetNames = new Set(data.sheets.map((s: SheetData) => s.name));
      const initialStatuses = new Map<string, StepStatus>();

      PRECONFIG_STEPS.forEach((step) => {
        if (sheetNames.has(step.sheetName)) {
          const sheet = data.sheets.find((s: SheetData) => s.name === step.sheetName);

          // Try to load saved step configuration
          const savedConfig = loadStepConfig(step.id);
          let columnMappings: ColumnMapping[] = [];
          let connectionId: string;
          let schema: string;

          if (savedConfig) {
            // Use saved configuration
            connectionId = savedConfig.connectionId;
            schema = savedConfig.schema;

            if (sheet) {
              // Use saved mappings but update with current sheet's sample values
              columnMappings = sheet.columns.map((excelCol: string) => {
                const saved = savedConfig.mappings.find(m => m.excelColumn === excelCol);
                return {
                  excelColumn: excelCol,
                  dbColumn: saved?.dbColumn || null,
                  sampleValues: sheet.rows.slice(0, 3).map((row: Record<string, unknown>) => row[excelCol]),
                };
              });
            }
            toast.success(`Loaded saved configuration for ${step.displayName}`);
          } else {
            // Check for legacy saved mappings (backward compatibility)
            const savedMappings = loadColumnMappings(step.id);

            // Determine default connection and schema
            connectionId = step.connectionId || connections[0]?.id || 'main';
            const selectedConnection = connections.find(c => c.id === connectionId);
            schema = selectedConnection?.schema || 'public';

            if (savedMappings && sheet) {
              // Use legacy saved mappings
              columnMappings = sheet.columns.map((excelCol: string) => {
                const saved = savedMappings.find(m => m.excelColumn === excelCol);
                return {
                  excelColumn: excelCol,
                  dbColumn: saved?.dbColumn || null,
                  sampleValues: sheet.rows.slice(0, 3).map((row: Record<string, unknown>) => row[excelCol]),
                };
              });
              toast.success(`Loaded saved column mappings for ${step.displayName}`);
            } else if (sheet) {
              // Use default mappings from step configuration
              columnMappings = createColumnMappings(step, sheet.columns, sheet.rows);
            }
          }

          initialStatuses.set(step.id, {
            stepId: step.id,
            status: 'pending',
            validation: null,
            importedCount: 0,
            truncatedCount: 0,
            error: null,
            columnMappings,
            truncateEnabled: false,
            truncateCascade: false,
            connectionId,
            schema,
          });
        }
      });

      setStepStatuses(initialStatuses);
      setCurrentStepIndex(0);
      toast.success(`File uploaded with ${data.sheets.length} sheets`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setIsLoading(false);
    }
  };

  // Update column mapping
  const handleMappingChange = (excelColumn: string, dbColumn: string | null) => {
    if (!currentStep) return;

    setStepStatuses((prev) => {
      const newMap = new Map(prev);
      const status = newMap.get(currentStep.id);
      if (status) {
        newMap.set(currentStep.id, {
          ...status,
          status: 'pending',
          validation: null,
          columnMappings: status.columnMappings.map((cm) =>
            cm.excelColumn === excelColumn ? { ...cm, dbColumn } : cm
          ),
        });
      }
      return newMap;
    });
  };

  // Toggle truncate option
  const handleToggleTruncate = () => {
    if (!currentStep) return;

    setStepStatuses((prev) => {
      const newMap = new Map(prev);
      const status = newMap.get(currentStep.id);
      if (status) {
        newMap.set(currentStep.id, {
          ...status,
          truncateEnabled: !status.truncateEnabled,
          // Reset cascade when disabling truncate
          truncateCascade: !status.truncateEnabled ? status.truncateCascade : false,
        });
      }
      return newMap;
    });
  };

  // Toggle cascade option
  const handleToggleCascade = () => {
    if (!currentStep) return;

    setStepStatuses((prev) => {
      const newMap = new Map(prev);
      const status = newMap.get(currentStep.id);
      if (status) {
        newMap.set(currentStep.id, {
          ...status,
          truncateCascade: !status.truncateCascade,
        });
      }
      return newMap;
    });
  };

  // Change connection for current step
  const handleConnectionChange = async (connectionId: string) => {
    if (!currentStep) return;

    setStepStatuses((prev) => {
      const newMap = new Map(prev);
      const status = newMap.get(currentStep.id);
      if (status) {
        // Get schema from the selected connection
        const selectedConnection = connections.find(c => c.id === connectionId);
        const newSchema = selectedConnection?.schema || 'public';

        newMap.set(currentStep.id, {
          ...status,
          connectionId,
          schema: newSchema,
          status: 'pending',
          validation: null,
        });
      }
      return newMap;
    });
  };

  // Validate current step
  const handleValidate = async () => {
    if (!currentStep || !parsedExcel) return;

    const sheet = getSheetData(currentStep);
    const status = stepStatuses.get(currentStep.id);
    if (!sheet || !status) return;

    // Reset filter when validating
    setValidationFilter('all');

    setStepStatuses((prev) => {
      const newMap = new Map(prev);
      newMap.set(currentStep.id, { ...status, status: 'validating' });
      return newMap;
    });

    try {
      // Get step config for lookups, unique checks, and default values
      const stepConfig = getStepById(currentStep.id);
      const hasLookups = (stepConfig?.lookups?.length ?? 0) > 0;
      const hasUniqueCheck = !!stepConfig?.uniqueCheck;

      // Extract default values from column mappings
      const defaultValues = stepConfig?.columnMappings
        .filter((cm) => cm.defaultValue)
        .map((cm) => ({
          dbColumn: cm.dbColumn,
          value: cm.defaultValue!,
        })) || [];
      const hasDefaultValues = defaultValues.length > 0;

      // Use import-with-lookup API if step has lookups, unique checks, or default values
      const apiEndpoint = (hasLookups || hasUniqueCheck || hasDefaultValues) ? '/api/import-with-lookup' : '/api/import';

      const requestBody: Record<string, unknown> = {
        tableName: currentStep.tableName,
        schema: status.schema,
        mappings: status.columnMappings,
        rows: sheet.rows,
        skipInvalid: false,
        truncateEnabled: status.truncateEnabled,  // Skip DB unique check if truncate is enabled
        connectionId: status.connectionId,
      };

      // Add lookups config if available
      if (hasLookups && stepConfig?.lookups) {
        requestBody.lookups = stepConfig.lookups;
      }

      // Add unique check config if available
      if (hasUniqueCheck && stepConfig?.uniqueCheck) {
        requestBody.uniqueCheck = stepConfig.uniqueCheck;
      }

      // Add default values if available
      if (hasDefaultValues) {
        requestBody.defaultValues = defaultValues;
      }

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      setStepStatuses((prev) => {
        const newMap = new Map(prev);
        newMap.set(currentStep.id, {
          ...status,
          status: data.validation ? 'validated' : 'error',
          validation: data.validation || null,
          error: data.error || null,
        });
        return newMap;
      });

      if (data.validation) {
        if (data.validation.invalidCount > 0) {
          toast.warning(
            `${data.validation.validCount} valid, ${data.validation.invalidCount} invalid rows`
          );
        } else {
          toast.success(`All ${data.validation.validCount} rows are valid`);
        }
      }
    } catch (err) {
      setStepStatuses((prev) => {
        const newMap = new Map(prev);
        newMap.set(currentStep.id, {
          ...status,
          status: 'error',
          error: err instanceof Error ? err.message : 'Validation failed',
        });
        return newMap;
      });
      toast.error('Validation failed');
    }
  };

  // Import current step
  const handleImport = async () => {
    if (!currentStep || !parsedExcel) return;

    const sheet = getSheetData(currentStep);
    const status = stepStatuses.get(currentStep.id);
    if (!sheet || !status || !status.validation) return;

    const updateProgress = (current: number, total: number, message: string) => {
      setStepStatuses((prev) => {
        const newMap = new Map(prev);
        const currentStatus = newMap.get(currentStep.id);
        if (currentStatus) {
          newMap.set(currentStep.id, {
            ...currentStatus,
            status: 'importing',
            progress: { current, total, message },
          });
        }
        return newMap;
      });
    };

    setStepStatuses((prev) => {
      const newMap = new Map(prev);
      newMap.set(currentStep.id, {
        ...status,
        status: 'importing',
        progress: { current: 0, total: sheet.rows.length, message: 'Starting import...' },
      });
      return newMap;
    });

    let truncatedCount = 0;
    let progressInterval: NodeJS.Timeout | null = null;

    try {
      // Get step config for lookups, unique checks, default values, and related inserts
      const stepConfig = getStepById(currentStep.id);

      // Truncate table first if enabled
      if (status.truncateEnabled) {
        updateProgress(0, sheet.rows.length, 'Truncating table...');

        const truncateBody: Record<string, unknown> = {
          tableName: currentStep.tableName,
          schema: status.schema,
          cascade: status.truncateCascade,
          connectionId: status.connectionId,
        };

        const truncateResponse = await fetch('/api/truncate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(truncateBody),
        });

        const truncateData = await truncateResponse.json();

        if (!truncateResponse.ok) {
          throw new Error(truncateData.error || 'Failed to truncate table');
        }

        truncatedCount = truncateData.deletedCount || 0;
        toast.info(`Truncated ${truncatedCount} existing rows`);
      }
      const hasLookups = (stepConfig?.lookups?.length ?? 0) > 0;
      const hasUniqueCheck = !!stepConfig?.uniqueCheck;
      const hasRelatedInserts = (stepConfig?.relatedInserts?.length ?? 0) > 0;

      // Extract default values from column mappings
      const defaultValues = stepConfig?.columnMappings
        .filter((cm) => cm.defaultValue)
        .map((cm) => ({
          dbColumn: cm.dbColumn,
          value: cm.defaultValue!,
        })) || [];
      const hasDefaultValues = defaultValues.length > 0;

      // Prepare import
      updateProgress(0, sheet.rows.length, `Validating ${sheet.rows.length} rows...`);

      // Use import-with-lookup API if step has lookups, unique checks, default values, or related inserts
      const apiEndpoint = (hasLookups || hasUniqueCheck || hasDefaultValues || hasRelatedInserts) ? '/api/import-with-lookup' : '/api/import';

      const requestBody: Record<string, unknown> = {
        tableName: currentStep.tableName,
        schema: status.schema,
        mappings: status.columnMappings,
        rows: sheet.rows,
        skipInvalid: true,
        truncateEnabled: status.truncateEnabled,  // Skip DB unique check if truncate is enabled
        connectionId: status.connectionId,
      };

      // Add lookups config if available
      if (hasLookups && stepConfig?.lookups) {
        requestBody.lookups = stepConfig.lookups;
      }

      // Add unique check config if available
      if (hasUniqueCheck && stepConfig?.uniqueCheck) {
        requestBody.uniqueCheck = stepConfig.uniqueCheck;
      }

      // Add default values if available
      if (hasDefaultValues) {
        requestBody.defaultValues = defaultValues;
      }

      // Add related inserts config if available
      if (hasRelatedInserts && stepConfig?.relatedInserts) {
        requestBody.relatedInserts = stepConfig.relatedInserts;
      }

      // Simulate progress during import with animation
      const totalRows = sheet.rows.length;
      const estimatedTimePerRow = 50; // ms per row (adjust based on testing)
      const updateInterval = 100; // Update every 100ms

      let simulatedProgress = 0;
      progressInterval = setInterval(() => {
        simulatedProgress += Math.ceil(totalRows / (estimatedTimePerRow * totalRows / updateInterval));
        if (simulatedProgress < totalRows) {
          updateProgress(
            Math.min(simulatedProgress, totalRows - 1),
            totalRows,
            `Importing rows to ${currentStep.tableName}...`
          );
        }
      }, updateInterval);

      // Import data
      updateProgress(0, totalRows, `Importing to ${currentStep.tableName}...`);

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      // Clear the progress interval
      if (progressInterval) clearInterval(progressInterval);

      if (data.success) {
        // Show final progress before completion
        updateProgress(data.importedCount, totalRows, `Completed! Imported ${data.importedCount} rows`);

        // Wait a moment to show the completion
        await new Promise(resolve => setTimeout(resolve, 500));

        // Save complete step configuration (mappings + database config) for future use
        saveStepConfig(currentStep.id, status.columnMappings, status.connectionId, status.schema);

        setStepStatuses((prev) => {
          const newMap = new Map(prev);
          newMap.set(currentStep.id, {
            ...status,
            status: 'completed',
            importedCount: data.importedCount,
            truncatedCount,
            progress: undefined,  // Clear progress
          });
          return newMap;
        });
        const truncateMsg = truncatedCount > 0 ? ` (truncated ${truncatedCount} first)` : '';
        toast.success(`Imported ${data.importedCount} rows to ${currentStep.tableName}${truncateMsg}`);
      } else {
        throw new Error(data.message || 'Import failed');
      }
    } catch (err) {
      // Clear the progress interval on error
      if (progressInterval) clearInterval(progressInterval);

      setStepStatuses((prev) => {
        const newMap = new Map(prev);
        newMap.set(currentStep.id, {
          ...status,
          status: 'error',
          error: err instanceof Error ? err.message : 'Import failed',
          progress: undefined,  // Clear progress
        });
        return newMap;
      });
      toast.error('Import failed');
    }
  };

  // Skip current step
  const handleSkip = () => {
    if (!currentStep) return;

    setStepStatuses((prev) => {
      const newMap = new Map(prev);
      const status = newMap.get(currentStep.id);
      if (status) {
        newMap.set(currentStep.id, { ...status, status: 'skipped' });
      }
      return newMap;
    });

    // Move to next step
    if (currentStepIndex < availableSteps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  // Navigate to next step
  const handleNext = () => {
    if (currentStepIndex < availableSteps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  // Navigate to previous step
  const handlePrevious = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  // Get status icon
  const getStatusIcon = (status: StepStatus['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'skipped':
        return <SkipForward className="h-5 w-5 text-muted-foreground" />;
      case 'validating':
      case 'importing':
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      case 'validated':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />;
    }
  };

  // Get table schema for current step
  useEffect(() => {
    if (currentStep && currentStatus) {
      fetchTableSchema(
        currentStep.tableName,
        currentStatus.schema,
        currentStatus.connectionId
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, currentStatus?.schema, currentStatus?.connectionId]);

  // Reset validation filter when step changes
  useEffect(() => {
    setValidationFilter('all');
  }, [currentStepIndex]);

  const currentTableSchema = currentStep && currentStatus
    ? tableSchemas.get(`${currentStatus.connectionId}.${currentStatus.schema}.${currentStep.tableName}`)
    : undefined;

  // Calculate summary
  const completedCount = Array.from(stepStatuses.values()).filter(
    (s) => s.status === 'completed'
  ).length;
  const totalImported = Array.from(stepStatuses.values()).reduce(
    (sum, s) => sum + s.importedCount,
    0
  );

  return (
    <main className="min-h-screen p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          &larr; Back to home
        </Link>
      </div>

      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Preconfig Import Wizard</h1>
          <p className="text-muted-foreground">
            Step-by-step import of configuration data from Excel
          </p>
        </div>
      </div>

      {/* Upload Step */}
      {currentStepIndex === -1 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload Preconfig Excel File
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FileUploader onFileSelect={handleFileSelect} isLoading={isLoading} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Expected Sheets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {PRECONFIG_STEPS.map((step) => (
                  <div
                    key={step.id}
                    className="p-3 border rounded-lg bg-muted/30"
                  >
                    <p className="font-medium text-sm">{step.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      {step.sheetName} → {step.tableName}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Wizard Steps */}
      {currentStepIndex >= 0 && parsedExcel && (
        <div className="grid grid-cols-12 gap-6">
          {/* Step Navigation Sidebar */}
          <div className="col-span-3">
            <Card className="sticky top-8">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Import Steps</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {completedCount} of {availableSteps.length} completed
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {availableSteps.map((step, index) => {
                    const status = stepStatuses.get(step.id);
                    const isActive = index === currentStepIndex;

                    return (
                      <button
                        key={step.id}
                        onClick={() => setCurrentStepIndex(index)}
                        className={`w-full p-3 text-left flex items-center gap-3 hover:bg-muted/50 transition-colors ${
                          isActive ? 'bg-primary/10' : ''
                        }`}
                      >
                        {status ? getStatusIcon(status.status) : (
                          <div className="h-5 w-5 rounded-full border-2 border-muted-foreground flex items-center justify-center text-xs">
                            {index + 1}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isActive ? 'text-primary' : ''}`}>
                            {step.displayName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {step.tableName}
                          </p>
                        </div>
                        {status?.status === 'completed' && (
                          <div className="flex items-center gap-1">
                            {status.truncatedCount > 0 && (
                              <span title={`Truncated ${status.truncatedCount} rows`}>
                                <Trash2 className="h-3 w-3 text-red-500" />
                              </span>
                            )}
                            <Badge variant="default" className="text-xs">
                              {status.importedCount}
                            </Badge>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {completedCount > 0 && (
              <Card className="mt-4">
                <CardContent className="p-4">
                  <p className="text-sm font-medium">Total Imported</p>
                  <p className="text-2xl font-bold text-primary">{totalImported}</p>
                  <p className="text-xs text-muted-foreground">rows across {completedCount} tables</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Main Content */}
          <div className="col-span-9 space-y-6">
            {currentStep && currentStatus && (
              <>
                {/* Step Header */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          Step {currentStepIndex + 1}: {currentStep.displayName}
                          {currentStatus.status === 'completed' && (
                            <Badge variant="default">Completed</Badge>
                          )}
                          {currentStatus.status === 'skipped' && (
                            <Badge variant="secondary">Skipped</Badge>
                          )}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {currentStep.description}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          Sheet: <code className="bg-muted px-1 rounded">{currentStep.sheetName}</code>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Table: <code className="bg-muted px-1 rounded">{currentStatus.schema}.{currentStep.tableName}</code>
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                {/* Database Connection and Schema Selection */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Database Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Database Connection
                      </label>
                      <Select
                        value={currentStatus.connectionId}
                        onValueChange={handleConnectionChange}
                        disabled={currentStatus.status === 'completed' || currentStatus.status === 'importing'}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select connection" />
                        </SelectTrigger>
                        <SelectContent>
                          {connections.map((conn) => (
                            <SelectItem key={conn.id} value={conn.id}>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{conn.name}</span>
                                <span className="text-xs text-muted-foreground">({conn.schema})</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Choose which database connection to import to. The schema is automatically selected based on the connection.
                      </p>
                    </div>

                    <div className="text-sm bg-muted p-3 rounded-lg">
                      <p className="font-medium mb-1">Import Target</p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Connection:</span>
                        <code className="bg-background px-1.5 py-0.5 rounded font-semibold">
                          {connections.find(c => c.id === currentStatus.connectionId)?.name || currentStatus.connectionId}
                        </code>
                      </div>
                      <div className="flex items-center gap-2 text-xs mt-1">
                        <span className="text-muted-foreground">Table:</span>
                        <code className="bg-background px-1.5 py-0.5 rounded">
                          {currentStatus.schema}.{currentStep.tableName}
                        </code>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Truncate Option */}
                <Card className={currentStatus.truncateEnabled
                  ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800'
                  : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Trash2 className={`h-5 w-5 ${currentStatus.truncateEnabled ? 'text-red-500' : 'text-muted-foreground'}`} />
                        <div>
                          <p className="font-medium text-sm">Truncate Table Before Import</p>
                          <p className="text-xs text-muted-foreground">
                            Delete all existing rows in <code className="bg-muted px-1 rounded">{currentStep.tableName}</code> before importing
                          </p>
                        </div>
                      </div>
                      <Button
                        variant={currentStatus.truncateEnabled ? 'destructive' : 'outline'}
                        size="sm"
                        onClick={handleToggleTruncate}
                        disabled={currentStatus.status === 'completed' || currentStatus.status === 'importing'}
                      >
                        {currentStatus.truncateEnabled ? 'Enabled' : 'Disabled'}
                      </Button>
                    </div>
                    {currentStatus.truncateEnabled && (
                      <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">CASCADE</p>
                            <p className="text-xs text-muted-foreground">
                              Also delete related data in other tables that reference this table
                            </p>
                          </div>
                          <Button
                            variant={currentStatus.truncateCascade ? 'destructive' : 'outline'}
                            size="sm"
                            onClick={handleToggleCascade}
                            disabled={currentStatus.status === 'completed' || currentStatus.status === 'importing'}
                          >
                            {currentStatus.truncateCascade ? 'ON' : 'OFF'}
                          </Button>
                        </div>
                        <p className="text-xs text-red-600 mt-3 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Warning: All existing data in this table will be permanently deleted!
                          {currentStatus.truncateCascade && ' Related data in other tables will also be deleted!'}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Lookup Info */}
                {(() => {
                  const stepConfig = getStepById(currentStep.id);
                  if (stepConfig?.lookups && stepConfig.lookups.length > 0) {
                    return (
                      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5" />
                            <div>
                              <p className="font-medium text-sm">Auto Lookup Enabled</p>
                              <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                                {stepConfig.lookups.map((lookup, i) => (
                                  <li key={i}>
                                    <code className="bg-muted px-1 rounded">{lookup.sourceColumn}</code>
                                    {' → '}
                                    <code className="bg-muted px-1 rounded">{lookup.targetColumn}</code>
                                    {' from '}
                                    <code className="bg-muted px-1 rounded">{lookup.lookupTable}</code>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  }
                  return null;
                })()}

                {/* Unique Check Info */}
                {(() => {
                  const stepConfig = getStepById(currentStep.id);
                  if (stepConfig?.uniqueCheck) {
                    const modeLabels = {
                      skip: 'Skip duplicates',
                      error: 'Report as errors',
                      upsert: 'Update existing records',
                    };
                    return (
                      <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-800">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-2">
                            <CheckCircle2 className="h-5 w-5 text-purple-500 mt-0.5" />
                            <div>
                              <p className="font-medium text-sm">Unique Check Enabled</p>
                              <p className="text-sm text-muted-foreground mt-1">
                                Columns: <code className="bg-muted px-1 rounded">{stepConfig.uniqueCheck.columns.join(' + ')}</code>
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Mode: <span className="font-medium">{modeLabels[stepConfig.uniqueCheck.mode]}</span>
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  }
                  return null;
                })()}

                {/* Column Mapping */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">Column Mapping</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Map Excel columns to database columns
                        </p>
                      </div>
                      {(loadStepConfig(currentStep.id) || loadColumnMappings(currentStep.id)) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            clearSavedMappings(currentStep.id);
                            // Reset to default mappings
                            const sheet = getSheetData(currentStep);
                            if (sheet) {
                              const defaultMappings = createColumnMappings(currentStep, sheet.columns, sheet.rows);
                              setStepStatuses((prev) => {
                                const newMap = new Map(prev);
                                const status = newMap.get(currentStep.id);
                                if (status) {
                                  newMap.set(currentStep.id, {
                                    ...status,
                                    columnMappings: defaultMappings,
                                    status: 'pending',
                                    validation: null,
                                  });
                                }
                                return newMap;
                              });
                            }
                          }}
                        >
                          Reset to Default
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Excel Column</TableHead>
                            <TableHead>Sample Values</TableHead>
                            <TableHead>Database Column</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {currentStatus.columnMappings.map((mapping) => (
                            <TableRow key={mapping.excelColumn}>
                              <TableCell className="font-medium">
                                {mapping.excelColumn}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                                {mapping.sampleValues
                                  .filter((v) => v !== null && v !== undefined && v !== '')
                                  .slice(0, 2)
                                  .map((v) => String(v))
                                  .join(', ')}
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={mapping.dbColumn || '_skip_'}
                                  onValueChange={(value) =>
                                    handleMappingChange(
                                      mapping.excelColumn,
                                      value === '_skip_' ? null : value
                                    )
                                  }
                                  disabled={currentStatus.status === 'completed'}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="_skip_">
                                      <span className="text-muted-foreground">-- Skip --</span>
                                    </SelectItem>
                                    {currentTableSchema?.columns.map((col) => (
                                      <SelectItem key={col.name} value={col.name}>
                                        <div className="flex items-center gap-2">
                                          <span>{col.name}</span>
                                          <Badge variant="outline" className="text-xs">
                                            {col.dataType}
                                          </Badge>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Validation Results */}
                {currentStatus.validation && (() => {
                  // Extract extended validation data
                  const validation = currentStatus.validation as unknown as {
                    validCount: number;
                    invalidCount: number;
                    invalidRows: Array<{ row: number; errors: Array<{ message: string }> }>;
                    skippedDuplicates?: Array<{ row: number; errors: Array<{ message: string }> }>;
                    skippedDuplicateCount?: number;
                  };
                  const skippedDuplicates = validation.skippedDuplicates ?? [];
                  const skippedDuplicateCount = validation.skippedDuplicateCount ?? 0;

                  // Get sheet data to know total rows and row values
                  const sheet = getSheetData(currentStep);
                  const totalRows = sheet?.rows.length ?? 0;
                  const sheetRows = sheet?.rows ?? [];

                  // Get mapped columns for display
                  const mappedColumns = currentStatus.columnMappings
                    .filter((m) => m.dbColumn)
                    .map((m) => m.excelColumn);

                  // Create a map of row issues
                  const errorMap = new Map<number, string>();
                  const duplicateMap = new Map<number, string>();

                  validation.invalidRows.forEach((r) => {
                    errorMap.set(r.row, r.errors.map((e) => e.message).join('; '));
                  });
                  skippedDuplicates.forEach((r) => {
                    duplicateMap.set(r.row, r.errors.map((e) => e.message).join('; '));
                  });

                  // Build all rows list with data values (skip empty rows)
                  type RowStatus = { row: number; type: 'valid' | 'error' | 'duplicate'; message: string; values: string };
                  const allRows: RowStatus[] = [];
                  for (let i = 1; i <= totalRows; i++) {
                    // Get row data values (row index is 0-based, but display is 1-based)
                    const rowData = sheetRows[i - 1] ?? {};
                    const values = mappedColumns
                      .map((col) => {
                        const val = rowData[col];
                        return val !== null && val !== undefined && val !== '' ? String(val) : '';
                      })
                      .filter(Boolean)
                      .join(' | ');

                    // Skip empty rows (no mapped values)
                    if (!values.trim()) {
                      continue;
                    }

                    if (errorMap.has(i)) {
                      allRows.push({ row: i, type: 'error', message: errorMap.get(i)!, values });
                    } else if (duplicateMap.has(i)) {
                      allRows.push({ row: i, type: 'duplicate', message: duplicateMap.get(i)!, values });
                    } else {
                      allRows.push({ row: i, type: 'valid', message: '', values });
                    }
                  }

                  // Apply filter
                  const filteredRows = validationFilter === 'all'
                    ? allRows
                    : allRows.filter((r) => r.type === validationFilter);

                  return (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Validation Results</CardTitle>
                        <div className="flex gap-3 text-sm">
                          <div className="flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span>{validation.validCount} valid</span>
                          </div>
                          {validation.invalidCount > 0 && (
                            <div className="flex items-center gap-1">
                              <XCircle className="h-4 w-4 text-red-500" />
                              <span>{validation.invalidCount} invalid</span>
                            </div>
                          )}
                          {skippedDuplicateCount > 0 && (
                            <div className="flex items-center gap-1">
                              <Copy className="h-4 w-4 text-orange-500" />
                              <span>{skippedDuplicateCount} duplicates</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Filter buttons */}
                      <div className="flex gap-2 mt-3">
                        <Button
                          variant={validationFilter === 'all' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setValidationFilter('all')}
                        >
                          All ({allRows.length})
                        </Button>
                        <Button
                          variant={validationFilter === 'valid' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setValidationFilter('valid')}
                          className={validationFilter === 'valid' ? '' : 'text-green-600 border-green-300 hover:bg-green-50'}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Valid ({validation.validCount})
                        </Button>
                        {validation.invalidCount > 0 && (
                          <Button
                            variant={validationFilter === 'error' ? 'destructive' : 'outline'}
                            size="sm"
                            onClick={() => setValidationFilter('error')}
                            className={validationFilter === 'error' ? '' : 'text-red-600 border-red-300 hover:bg-red-50'}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Errors ({validation.invalidCount})
                          </Button>
                        )}
                        {skippedDuplicateCount > 0 && (
                          <Button
                            variant={validationFilter === 'duplicate' ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={() => setValidationFilter('duplicate')}
                            className={validationFilter === 'duplicate' ? '' : 'text-orange-600 border-orange-300 hover:bg-orange-50'}
                          >
                            <Copy className="h-4 w-4 mr-1" />
                            Duplicates ({skippedDuplicateCount})
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                        <Table>
                          <TableHeader className="sticky top-0 bg-background">
                            <TableRow>
                              <TableHead className="w-12">Row</TableHead>
                              <TableHead className="w-20">Status</TableHead>
                              <TableHead>Data</TableHead>
                              <TableHead>Message</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredRows.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                  No rows match the selected filter
                                </TableCell>
                              </TableRow>
                            ) : filteredRows.map((row) => (
                              <TableRow
                                key={row.row}
                                className={
                                  row.type === 'error'
                                    ? 'bg-red-50 dark:bg-red-950/20'
                                    : row.type === 'duplicate'
                                    ? 'bg-orange-50 dark:bg-orange-950/20'
                                    : ''
                                }
                              >
                                <TableCell className="font-medium">{row.row}</TableCell>
                                <TableCell>
                                  {row.type === 'valid' && (
                                    <div className="flex items-center gap-1 text-green-500">
                                      <CheckCircle2 className="h-4 w-4" />
                                      <span className="text-xs">Valid</span>
                                    </div>
                                  )}
                                  {row.type === 'error' && (
                                    <div className="flex items-center gap-1 text-red-500">
                                      <XCircle className="h-4 w-4" />
                                      <span className="text-xs">Error</span>
                                    </div>
                                  )}
                                  {row.type === 'duplicate' && (
                                    <div className="flex items-center gap-1 text-orange-500">
                                      <Copy className="h-4 w-4" />
                                      <span className="text-xs">Skip</span>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm font-mono max-w-[300px] truncate" title={row.values}>
                                  {row.values}
                                </TableCell>
                                <TableCell className={`text-sm ${
                                  row.type === 'error'
                                    ? 'text-red-600 dark:text-red-400'
                                    : row.type === 'duplicate'
                                    ? 'text-orange-600 dark:text-orange-400'
                                    : 'text-green-600 dark:text-green-400'
                                }`}>
                                  {row.type === 'valid' ? '✓' : row.message}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })()}

                {/* Error Display */}
                {currentStatus.error && (
                  <Card className="border-destructive">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-destructive">
                        <XCircle className="h-5 w-5" />
                        <p>{currentStatus.error}</p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={handlePrevious}
                    disabled={currentStepIndex === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>

                  <div className="flex gap-2">
                    {currentStatus.status !== 'completed' && currentStatus.status !== 'skipped' && (
                      <Button variant="ghost" onClick={handleSkip}>
                        <SkipForward className="h-4 w-4 mr-1" />
                        Skip
                      </Button>
                    )}

                    {currentStatus.status === 'pending' && (
                      <Button
                        onClick={handleValidate}
                        disabled={
                          currentStatus.columnMappings.every((cm) => cm.dbColumn === null)
                        }
                      >
                        Validate
                      </Button>
                    )}

                    {currentStatus.status === 'validating' && (
                      <Button disabled>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Validating...
                      </Button>
                    )}

                    {currentStatus.status === 'validated' && currentStatus.validation && (
                      <>
                        <Button
                          variant="outline"
                          onClick={handleValidate}
                        >
                          <AlertCircle className="h-4 w-4 mr-1" />
                          Verify Again
                        </Button>
                        <Button
                          onClick={handleImport}
                          disabled={currentStatus.validation.validCount === 0}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Import {currentStatus.validation.validCount} Rows
                        </Button>
                      </>
                    )}

                    {currentStatus.status === 'importing' && (
                      <div className="w-full">
                        <Button disabled className="mb-4">
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Importing...
                        </Button>
                        {currentStatus.progress && (
                          <div className="space-y-3 p-4 rounded-lg border bg-card">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-muted-foreground font-medium">{currentStatus.progress.message}</span>
                              <span className="font-semibold text-lg tabular-nums">
                                {Math.round((currentStatus.progress.current / currentStatus.progress.total) * 100)}%
                              </span>
                            </div>
                            <div className="relative w-full h-6 bg-muted rounded-full overflow-hidden shadow-inner">
                              <div
                                className="absolute inset-0 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 transition-all duration-500 ease-out rounded-full shadow-md"
                                style={{
                                  width: `${(currentStatus.progress.current / currentStatus.progress.total) * 100}%`,
                                }}
                              >
                                <div className="absolute inset-0 bg-gradient-to-t from-transparent via-white/20 to-transparent animate-pulse" />
                              </div>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-xs font-bold text-white drop-shadow-md mix-blend-difference">
                                  {currentStatus.progress.current} / {currentStatus.progress.total}
                                </span>
                              </div>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Processing records...</span>
                              <span className="font-mono">
                                {currentStatus.progress.current}/{currentStatus.progress.total} completed
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {(currentStatus.status === 'completed' || currentStatus.status === 'skipped') && (
                      <Button
                        onClick={handleNext}
                        disabled={currentStepIndex === availableSteps.length - 1}
                      >
                        Next Step
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    )}

                    {currentStatus.status === 'error' && (
                      <Button onClick={handleValidate}>
                        Retry
                      </Button>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    onClick={handleNext}
                    disabled={currentStepIndex === availableSteps.length - 1}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>

                {/* Completion Message */}
                {currentStepIndex === availableSteps.length - 1 &&
                  currentStatus.status === 'completed' && (
                    <Card className="border-green-500 bg-green-50 dark:bg-green-950">
                      <CardContent className="p-6 text-center">
                        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Import Complete!</h3>
                        <p className="text-muted-foreground mb-4">
                          Successfully imported {totalImported} rows across {completedCount} tables.
                        </p>
                        <div className="flex justify-center gap-4">
                          <Button
                            onClick={() => {
                              setParsedExcel(null);
                              setStepStatuses(new Map());
                              setCurrentStepIndex(-1);
                            }}
                          >
                            Import Another File
                          </Button>
                          <Link href="/">
                            <Button variant="outline">Back to Home</Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  )}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
