import React from 'react';
import { PhotoPoint } from '@/types/gpx';
import { Camera } from 'lucide-react';

interface PhotoPiPProps {
  photo: PhotoPoint | null;
}

/**
 * Picture-in-picture náhled fotky během 3D průletu.
 * Zobrazuje se vpravo nahoře, když se kamera přiblíží k fotce.
 */
export const PhotoPiP: React.FC<PhotoPiPProps> = ({ photo }) => {
  if (!photo) return null;

  return (
    <div
      key={photo.id}
      className="absolute top-2 right-2 z-20 w-60 bg-background/95 backdrop-blur-sm border rounded-lg shadow-xl overflow-hidden animate-slide-in-right"
    >
      <div className="relative aspect-[4/3] bg-muted">
        <img
          src={photo.photo}
          alt={photo.description || 'Fotka z trasy'}
          className="w-full h-full object-cover"
          draggable={false}
        />
        <div className="absolute top-1.5 left-1.5 bg-background/80 backdrop-blur-sm rounded-full p-1">
          <Camera className="w-3 h-3 text-foreground" />
        </div>
      </div>
      {photo.description && (
        <div className="px-2.5 py-1.5 text-xs text-foreground truncate border-t">
          {photo.description}
        </div>
      )}
    </div>
  );
};
