'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent } from '@/components/ui/card';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  isLoading?: boolean;
}

export function FileUploader({ onFileSelect, isLoading }: FileUploaderProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: false,
    disabled: isLoading,
  });

  return (
    <Card
      {...getRootProps()}
      className={`cursor-pointer border-2 border-dashed transition-colors ${
        isDragActive
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/25 hover:border-primary/50'
      } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <CardContent className="flex flex-col items-center justify-center py-12">
        <input {...getInputProps()} />
        <svg
          className="w-12 h-12 text-muted-foreground mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        {isLoading ? (
          <p className="text-muted-foreground">Processing file...</p>
        ) : isDragActive ? (
          <p className="text-primary font-medium">Drop the file here</p>
        ) : (
          <>
            <p className="text-foreground font-medium mb-1">
              Drop your Excel file here
            </p>
            <p className="text-muted-foreground text-sm">
              or click to browse (.xlsx, .xls)
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
