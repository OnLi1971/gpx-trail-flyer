import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileUpload: (content: string, filename: string) => void;
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, className }) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        onFileUpload(content, file.name);
      };
      reader.readAsText(file);
    }
  }, [onFileUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/gpx+xml': ['.gpx'],
      'text/xml': ['.gpx'],
      'application/xml': ['.gpx']
    },
    multiple: false
  });

  return (
    <Card 
      {...getRootProps()} 
      className={cn(
        "border-2 border-dashed border-border hover:border-primary transition-colors cursor-pointer",
        "p-8 text-center space-y-4",
        isDragActive && "border-primary bg-primary/5",
        className
      )}
    >
      <input {...getInputProps()} />
      
      <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
        {isDragActive ? (
          <FileText className="w-6 h-6 text-primary" />
        ) : (
          <Upload className="w-6 h-6 text-primary" />
        )}
      </div>
      
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">
          {isDragActive ? 'Pusť GPX soubor zde' : 'Nahraj GPX soubor'}
        </h3>
        <p className="text-muted-foreground">
          Přetáhni GPX soubor sem nebo klikni pro výběr
        </p>
      </div>
      
      <Button variant="outline" type="button">
        Vybrat soubor
      </Button>
    </Card>
  );
};