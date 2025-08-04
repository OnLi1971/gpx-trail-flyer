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
  console.log('PhotoViewModal render:', { photo, isOpen });
  
  if (!photo) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-auto animate-fade-in" aria-describedby="photo-description">
        <div className="space-y-4 animate-fade-in">
          <img 
            src={photo.photo} 
            alt={photo.description || 'Fotka z trasy'} 
            className="w-full max-h-96 object-contain rounded-lg animate-[fade-in_0.6s_ease-out,scale-in_0.6s_ease-out] transition-all duration-300"
            onError={(e) => {
              console.error('Image failed to load:', photo.photo);
              e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23cccccc"/><text x="50" y="50" text-anchor="middle" dy=".3em">Chyba</text></svg>';
            }}
          />
          <div id="photo-description" className="animate-[fade-in_0.8s_ease-out]">
            {photo.description ? (
              <p className="text-sm text-foreground">
                {photo.description}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Žádný popis
              </p>
            )}
            <div className="text-xs text-muted-foreground mt-2">
              GPS: {photo.lat.toFixed(6)}, {photo.lon.toFixed(6)}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};