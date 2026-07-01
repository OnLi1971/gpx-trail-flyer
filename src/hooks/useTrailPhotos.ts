import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TrailPhoto {
  id: string;
  trail_id: string;
  photo_url: string;
  description: string;
  lat: number;
  lon: number;
  photo_timestamp: number;
}

export function useTrailPhotos(trailId: string | null | undefined, canEdit: boolean) {
  const [photos, setPhotos] = useState<TrailPhoto[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!trailId) { setPhotos([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('trail_photos')
      .select('*')
      .eq('trail_id', trailId)
      .order('photo_timestamp', { ascending: true });
    setLoading(false);
    if (error) { console.error(error); return; }
    setPhotos((data ?? []) as TrailPhoto[]);
  }, [trailId]);

  useEffect(() => { reload(); }, [reload]);

  const uploadPhoto = useCallback(async (
    file: File,
    lat: number,
    lon: number,
    description: string,
  ) => {
    if (!trailId || !canEdit) return;
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error('Musíš být přihlášený pro nahrání fotky');
      const uid = userData.user.id;
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${uid}/${trailId}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from('trail-photos').upload(path, file, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });
      if (up.error) throw up.error;
      const { data: pub } = supabase.storage.from('trail-photos').getPublicUrl(path);
      const ins = await supabase.from('trail_photos').insert({
        trail_id: trailId,
        photo_url: pub.publicUrl,
        description,
        lat, lon,
        photo_timestamp: Date.now(),
      }).select().single();
      if (ins.error) throw ins.error;
      setPhotos((p) => [...p, ins.data as TrailPhoto]);
      toast.success('Fotka přidána');
    } catch (e: any) {
      console.error(e);
      toast.error('Nepodařilo se nahrát fotku', { description: e?.message });
    }
  }, [trailId, canEdit]);

  const deletePhoto = useCallback(async (photo: TrailPhoto) => {
    if (!canEdit) return;
    try {
      // best-effort remove file
      const key = photo.photo_url.split('/trail-photos/')[1];
      if (key) await supabase.storage.from('trail-photos').remove([key]);
      const { error } = await supabase.from('trail_photos').delete().eq('id', photo.id);
      if (error) throw error;
      setPhotos((p) => p.filter((x) => x.id !== photo.id));
      toast.success('Fotka smazána');
    } catch (e: any) {
      toast.error('Smazání selhalo', { description: e?.message });
    }
  }, [canEdit]);

  return { photos, loading, reload, uploadPhoto, deletePhoto };
}
