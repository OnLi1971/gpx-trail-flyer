import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { PhotoPoint } from '@/types/gpx';

interface PhotoViewModalProps {
  photo: PhotoPoint | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Fullscreen photo overlay během průletu.
 * Fotka přes celou obrazovku, jemný Ken Burns efekt přes CSS keyframes.
 */
export const PhotoViewModal: React.FC<PhotoViewModalProps> = ({
  photo,
  isOpen,
  onClose,
}) => {
  if (!photo) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-none w-screen h-screen p-0 border-0 bg-black rounded-none sm:rounded-none flex items-center justify-center [&>button]:text-white [&>button]:bg-black/40 [&>button]:rounded-full [&>button]:p-2 [&>button]:top-4 [&>button]:right-4"
        aria-describedby="photo-description"
      >
        <div className="relative w-full h-full overflow-hidden bg-black flex items-center justify-center">
          <img
            key={photo.id}
            src={photo.photo}
            alt={photo.description || 'Fotka z trasy'}
            className="w-full h-full object-contain animate-photo-kenburns"
            onError={(e) => {
              console.error('Image failed to load:', photo.photo);
              e.currentTarget.src =
                'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23222"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="white">Chyba</text></svg>';
            }}
          />
          {photo.description && (
            <div
              id="photo-description"
              className="absolute bottom-0 left-0 right-0 px-6 py-5 bg-gradient-to-t from-black/85 via-black/50 to-transparent"
            >
              <p className="text-white text-base sm:text-lg font-medium drop-shadow-lg">
                {photo.description}
              </p>
              <p className="text-white/60 text-xs mt-1">
                {photo.lat.toFixed(5)}, {photo.lon.toFixed(5)}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
