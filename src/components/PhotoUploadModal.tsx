import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { PhotoPoint } from '@/types/gpx';

interface PhotoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (photo: Omit<PhotoPoint, 'id' | 'timestamp'>) => void;
  lat: number;
  lon: number;
}

export const PhotoUploadModal: React.FC<PhotoUploadModalProps> = ({
  isOpen,
  onClose,
  onSave,
  lat,
  lon
}) => {
  const [description, setDescription] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      
      // Compress image before creating preview
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions (max 800px width)
        const maxWidth = 800;
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        
        // Draw compressed image
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Convert to base64 with 70% quality
        const compressedImage = canvas.toDataURL('image/jpeg', 0.7);
        setPhotoPreview(compressedImage);
      };
      
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    console.log('HandleSave called, photoPreview:', !!photoPreview);
    if (!photoPreview) return;
    
    console.log('Saving photo at:', lat, lon);
    onSave({
      lat,
      lon,
      photo: photoPreview,
      description
    });
    
    // Reset form
    setDescription('');
    setPhotoFile(null);
    setPhotoPreview('');
    onClose();
  };

  const handleClose = () => {
    setDescription('');
    setPhotoFile(null);
    setPhotoPreview('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Přidat fotku k místu</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="photo">Fotka</Label>
            <Input
              id="photo"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="mt-1"
            />
            {photoPreview && (
              <img 
                src={photoPreview} 
                alt="Preview" 
                className="mt-2 max-h-32 rounded-md object-cover"
              />
            )}
          </div>
          
          <div>
            <Label htmlFor="description">Popis</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Popište toto místo..."
              className="mt-1"
            />
          </div>
          
          <div className="text-sm text-muted-foreground">
            Souřadnice: {lat.toFixed(6)}, {lon.toFixed(6)}
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={handleClose}>
              Zrušit
            </Button>
            <Button 
              onClick={handleSave}
              disabled={!photoPreview}
            >
              Uložit
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};