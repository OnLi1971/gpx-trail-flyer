import React, { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhotoPoint } from '@/types/gpx';
import { compressImage } from '@/utils/exifReader';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface ManualPhotoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  coords: { lat: number; lon: number } | null;
  onConfirm: (photo: PhotoPoint) => void;
}

export const ManualPhotoDialog: React.FC<ManualPhotoDialogProps> = ({
  isOpen,
  onClose,
  coords,
  onConfirm,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setPreview(null);
      setDescription('');
      setIsProcessing(false);
    }
  }, [isOpen]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(selected);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!file || !coords) return;
    setIsProcessing(true);
    const thumbnail = await compressImage(file);
    setIsProcessing(false);

    if (!thumbnail) {
      toast.error('Nepodařilo se zpracovat fotku');
      return;
    }

    onConfirm({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      lat: coords.lat,
      lon: coords.lon,
      photo: thumbnail,
      description: description.trim() || file.name.replace(/\.[^.]+$/, ''),
      timestamp: Date.now(),
    });
    onClose();
  }, [file, coords, description, onConfirm, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Přidat fotku na mapu</DialogTitle>
          <DialogDescription>
            {coords
              ? `GPS: ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`
              : 'Vyber souřadnice na mapě'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="photo-file">Fotka</Label>
            <Input
              id="photo-file"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
            />
          </div>

          {preview && (
            <img
              src={preview}
              alt="Náhled"
              className="w-full max-h-48 object-contain rounded-md border"
            />
          )}

          <div className="space-y-2">
            <Label htmlFor="photo-desc">Popis (volitelné)</Label>
            <Textarea
              id="photo-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Co je na fotce?"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            Zrušit
          </Button>
          <Button onClick={handleConfirm} disabled={!file || isProcessing}>
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Zpracovávám...
              </>
            ) : (
              'Přidat fotku'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
