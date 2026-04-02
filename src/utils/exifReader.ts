import exifr from 'exifr';

interface PhotoGPSResult {
  lat: number;
  lon: number;
  timestamp?: number;
  thumbnail: string; // base64 compressed
}

export async function extractPhotoGPS(file: File): Promise<PhotoGPSResult | null> {
  try {
    const exif = await exifr.parse(file, true);
    console.log('EXIF data for', file.name, exif);

    if (!exif || typeof exif.latitude === 'undefined' || typeof exif.longitude === 'undefined') {
      console.log(`Photo ${file.name} has no GPS data, skipping.`);
      return null;
    }

    const thumbnail = await compressImage(file);

    const timestamp = exif.DateTimeOriginal || exif.CreateDate;

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

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxWidth = 800;
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
