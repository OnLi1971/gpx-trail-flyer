import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { PhotoPoint } from '@/types/gpx';

interface PhotoViewModalProps {
  photo: PhotoPoint | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PhotoViewModal: React.FC<PhotoViewModalProps> = ({
  photo,
  isOpen,
  onClose
}) => {
  if (!photo) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-auto">
        <div className="space-y-4">
          <img 
            src={photo.photo} 
            alt={photo.description || 'Fotka z trasy'} 
            className="w-full h-64 object-cover rounded-lg"
          />
          {photo.description && (
            <p className="text-sm text-muted-foreground">
              {photo.description}
            </p>
          )}
          <div className="text-xs text-muted-foreground">
            GPS: {photo.lat.toFixed(6)}, {photo.lon.toFixed(6)}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};