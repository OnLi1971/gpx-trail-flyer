import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { GPXData } from '@/types/gpx';
import { generateSlug } from '@/lib/slug';
import { toast } from 'sonner';
import { Loader2, Save, Copy, Check } from 'lucide-react';

interface SaveTrailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gpxData: GPXData;
  defaultName?: string;
}

export const SaveTrailDialog = ({ open, onOpenChange, gpxData, defaultName }: SaveTrailDialogProps) => {
  const { user } = useAuth();
  const [name, setName] = useState(defaultName || '');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
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

    try {
      const slug = generateSlug(name.trim());
      const { error: trailErr } = await supabase
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

      const shareUrl = `${window.location.origin}/trail/${slug}`;
      setSavedShareUrl(shareUrl);
      toast.success('Trasa uložena!');
    } catch (err: any) {
      console.error(err);
      toast.error(`Chyba ukládání: ${err.message || err}`);
    } finally {
      setSaving(false);
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
                  Kdokoliv s odkazem si trasu zobrazí.
                </p>
              </div>
              <Switch id="public-switch" checked={isPublic} onCheckedChange={setIsPublic} disabled={saving} />
            </div>
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
