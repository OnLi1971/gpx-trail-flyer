import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  lat: number | null;
  lon: number | null;
  onClose: () => void;
  onUpload: (file: File, lat: number, lon: number, description: string) => Promise<void>;
}

export const PhotoUploadDialog: React.FC<Props> = ({ open, lat, lon, onClose, onUpload }) => {
  const [file, setFile] = useState<File | null>(null);
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const preview = file ? URL.createObjectURL(file) : null;

  const handleSubmit = async () => {
    if (!file || lat == null || lon == null) return;
    setSaving(true);
    await onUpload(file, lat, lon, desc.trim());
    setSaving(false);
    setFile(null); setDesc('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Přidat fotku k trase</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {preview && (
            <img src={preview} alt="Náhled" className="w-full h-48 object-cover rounded-md border" />
          )}
          <Textarea
            placeholder="Popisek (např. Výhled na Milešovku)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            maxLength={140}
          />
          {lat != null && lon != null && (
            <p className="text-xs text-muted-foreground">
              Pozice: {lat.toFixed(5)}, {lon.toFixed(5)}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Zrušit</Button>
          <Button onClick={handleSubmit} disabled={!file || saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Nahrát
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
