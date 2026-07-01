import React from 'react';
import type { TrailPhoto } from '@/hooks/useTrailPhotos';

interface Props {
  photo: TrailPhoto | null;
}

/**
 * Fullscreen-safe floating polaroid card shown during flythrough
 * when the camera passes near a photo's location.
 */
export const PhotoOverlay: React.FC<Props> = ({ photo }) => {
  return (
    <div
      className="pointer-events-none absolute top-16 right-4 z-30 w-64 md:w-80 transition-all duration-500"
      style={{
        opacity: photo ? 1 : 0,
        transform: photo ? 'translateY(0) scale(1) rotate(-1.5deg)' : 'translateY(-16px) scale(0.92) rotate(-6deg)',
      }}
    >
      {photo && (
        <div className="bg-white rounded-md shadow-2xl p-3 pb-5 border border-white/60 ring-1 ring-black/5">
          <img
            src={photo.photo_url}
            alt={photo.description || 'Trail photo'}
            className="w-full h-40 md:h-52 object-cover rounded-sm"
            loading="eager"
          />
          {photo.description && (
            <p className="mt-2 text-center text-sm text-neutral-800 font-medium leading-tight [font-family:'Caveat',cursive]">
              {photo.description}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
