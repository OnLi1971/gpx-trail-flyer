import React, { useEffect, useState } from 'react';
import type { TrailPhoto } from '@/hooks/useTrailPhotos';

interface Props {
  photo: TrailPhoto | null;
}

/**
 * Floating polaroid card shown during flythrough when the camera
 * passes near a photo's location. One-shot trigger with a smooth
 * fade + slight rotation entrance and Ken Burns effect on the image.
 */
export const PhotoOverlay: React.FC<Props> = ({ photo }) => {
  // Keep last photo mounted during fade-out so animation is smooth
  const [shown, setShown] = useState<TrailPhoto | null>(photo);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (photo) {
      setShown(photo);
      // next frame → trigger transition
      const r = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(r);
    } else {
      setVisible(false);
      const t = setTimeout(() => setShown(null), 500);
      return () => clearTimeout(t);
    }
  }, [photo]);

  if (!shown) return null;

  return (
    <div
      className="pointer-events-none absolute top-20 right-4 z-30 w-64 sm:w-72 md:w-80 transition-all duration-500 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible
          ? 'translateY(0) scale(1) rotate(-1.5deg)'
          : 'translateY(-24px) scale(0.9) rotate(-8deg)',
      }}
    >
      <div className="bg-white rounded-md shadow-2xl p-3 pb-4 border border-white/60 ring-1 ring-black/10">
        <div className="relative w-full h-40 sm:h-48 md:h-56 overflow-hidden rounded-sm bg-neutral-100">
          <img
            key={shown.id}
            src={shown.photo_url}
            alt={shown.description || 'Trail photo'}
            className="absolute inset-0 w-full h-full object-cover animate-photo-kenburns"
            loading="eager"
            decoding="async"
          />
        </div>
        {shown.description && (
          <p
            className="mt-2 text-center text-base text-neutral-800 font-medium leading-snug break-words whitespace-pre-wrap [font-family:'Caveat',cursive]"
          >
            {shown.description}
          </p>
        )}
      </div>
    </div>
  );
};
