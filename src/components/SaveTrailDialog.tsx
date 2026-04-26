import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { GPXData, PhotoPoint } from '@/types/gpx';
import { generateSlug } from '@/lib/slug';
import { toast } from 'sonner';
import { Loader2, Save, Copy, Check } from 'lucide-react';

interface SaveTrailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gpxData: GPXData;
  photos: PhotoPoint[];
  defaultName?: string;
}

// Convert dataURL or HTTP URL to Blob
async function toBlob(src: string): Promise<Blob> {
  if (src.startsWith('data:')) {
    const res = await fetch(src);
    return await res.blob();
  }
  const res = await fetch(src);
  return await res.blob();
}

export const SaveTrailDialog = ({ open, onOpenChange, gpxData, photos, defaultName }: SaveTrailDialogProps) => {
  const { user } = useAuth();
  const [name, setName] = useState(defaultName || '');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [savedShareUrl, setSavedShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSave = async () => {
    if (!user) {
      toast.error('Musíš být přihlášen');
      return;
    }
    if (!name.trim()) {
      toast.error('Zadej název trasy');
      return;
    }

    setSaving(true);
    setProgress('Vytvářím trasu…');

    try {
      const slug = generateSlug(name.trim());
      const { data: trail, error: trailErr } = await supabase
        .from('trails')
        .insert({
          user_id: user.id,
          name: name.trim(),
          slug,
          gpx_data: gpxData as any,
          is_public: isPublic,
        })
        .select()
        .single();

      if (trailErr) throw trailErr;

      // Upload photos
      if (photos.length > 0) {
        const uploaded: Array<{ trail_id: string; photo_url: string; description: string; lat: number; lon: number; photo_timestamp: number }> = [];
        for (let i = 0; i < photos.length; i++) {
          const p = photos[i];
          setProgress(`Nahrávám fotku ${i + 1}/${photos.length}…`);
          try {
            const blob = await toBlob(p.photo);
            const ext = blob.type.split('/')[1]?.split('+')[0] || 'jpg';
            const path = `${user.id}/${trail.id}/${p.id}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from('trail-photos')
              .upload(path, blob, { contentType: blob.type, upsert: true });
            if (upErr) throw upErr;
            const { data: pub } = supabase.storage.from('trail-photos').getPublicUrl(path);
            uploaded.push({
              trail_id: trail.id,
              photo_url: pub.publicUrl,
              description: p.description,
              lat: p.lat,
              lon: p.lon,
              photo_timestamp: p.timestamp,
            });
          } catch (err) {
            console.error('Photo upload failed:', err);
            toast.error(`Nepodařilo se nahrát fotku ${i + 1}`);
          }
        }

        if (uploaded.length > 0) {
          setProgress('Ukládám fotky do databáze…');
          const { error: photosErr } = await supabase.from('trail_photos').insert(uploaded);
          if (photosErr) throw photosErr;
        }
      }

      const shareUrl = `${window.location.origin}/trail/${slug}`;
      setSavedShareUrl(shareUrl);
      toast.success('Trasa uložena!');
    } catch (err: any) {
      console.error(err);
      toast.error(`Chyba ukládání: ${err.message || err}`);
    } finally {
      setSaving(false);
      setProgress('');
    }
  };

  const handleCopy = async () => {
    if (!savedShareUrl) return;
    await navigator.clipboard.writeText(savedShareUrl);
    setCopied(true);
    toast.success('Odkaz zkopírován');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    if (saving) return;
    setName(defaultName || '');
    setIsPublic(false);
    setSavedShareUrl(null);
    setCopied(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Uložit trasu</DialogTitle>
          <DialogDescription>
            {savedShareUrl ? 'Trasa je uložena. Můžeš ji najít v sekci Moje trasy.' : 'Pojmenuj trasu a vyber, jestli má být sdílitelná odkazem.'}
          </DialogDescription>
        </DialogHeader>

        {!savedShareUrl ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trail-name">Název trasy</Label>
              <Input
                id="trail-name"
                placeholder="Např. Lovoš, Sněžka, Kolem Máchova jezera…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                autoFocus
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="public-switch" className="cursor-pointer">Veřejně sdílet</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Kdokoliv s odkazem si trasu zobrazí (bez uploadu).
                </p>
              </div>
              <Switch id="public-switch" checked={isPublic} onCheckedChange={setIsPublic} disabled={saving} />
            </div>
            {photos.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Bude nahráno {photos.length} fotek do cloudu.
              </p>
            )}
            {progress && (
              <p className="text-sm text-primary flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                {progress}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {isPublic ? (
              <>
                <Label>Sdílecí odkaz</Label>
                <div className="flex gap-2">
                  <Input value={savedShareUrl} readOnly />
                  <Button variant="outline" size="icon" onClick={handleCopy}>
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Trasa je soukromá. Sdílení můžeš zapnout v sekci Moje trasy.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {!savedShareUrl ? (
            <>
              <Button variant="ghost" onClick={handleClose} disabled={saving}>Zrušit</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Uložit
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>Hotovo</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
