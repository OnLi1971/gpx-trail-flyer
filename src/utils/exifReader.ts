import exifr from 'exifr';

interface PhotoGPSResult {
  lat: number;
  lon: number;
  timestamp?: number;
  thumbnail: string;
}

export async function extractPhotoGPS(file: File): Promise<PhotoGPSResult | null> {
  try {
    const exif = await exifr.parse(file, { gps: true, tiff: true });

    if (!exif?.latitude || !exif?.longitude) {
      return null;
    }

    const thumbnail = await compressImage(file);
    if (!thumbnail) return null;

    const timestamp = exif.DateTimeOriginal ?? exif.CreateDate;

    return {
      lat: exif.latitude,
      lon: exif.longitude,
      timestamp: timestamp ? new Date(timestamp).getTime() : undefined,
      thumbnail,
    };
  } catch (err) {
    console.warn('EXIF parse failed for', file.name, err);
    return null;
  }
}

export function compressImage(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    if (file.size > 50 * 1024 * 1024) {
      console.warn(`${file.name} je příliš velká (${(file.size / 1024 / 1024).toFixed(1)} MB), přeskakuji`);
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      console.warn('FileReader selhal pro', file.name);
      resolve(null);
    };
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => {
        console.warn('Image load selhal pro', file.name);
        resolve(null);
      };
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX = 800;
          const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
          canvas.width = Math.round(img.width * ratio);
          canvas.height = Math.round(img.height * ratio);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const result = canvas.toDataURL('image/jpeg', 0.7);
          canvas.width = 0;
          canvas.height = 0;
          img.src = '';
          resolve(result);
        } catch (err) {
          console.warn('Canvas compression selhal pro', file.name, err);
          resolve(null);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
