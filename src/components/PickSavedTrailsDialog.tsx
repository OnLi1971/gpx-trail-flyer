import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, Check } from 'lucide-react';
import { GPXData } from '@/types/gpx';
import { Stage, stageColorAt } from '@/utils/stages';
import { totalDistanceKm } from '@/utils/trimGpx';

interface Row {
  id: string;
  name: string;
  gpx_data: unknown;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (stages: Stage[]) => void;
  startIndex: number;
}

export const PickSavedTrailsDialog: React.FC<Props> = ({ open, onOpenChange, onPick, startIndex }) => {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !user) return;
    setOrder([]);
    setLoading(true);
    supabase
      .from('trails')
      .select('id, name, gpx_data, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        setLoading(false);
        if (error) { toast.error('Nepodařilo se načíst trasy'); return; }
        setRows((data as Row[]) || []);
      });
  }, [open, user]);

  const toggle = (id: string) =>
    setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  const confirm = () => {
    const stages: Stage[] = order
      .map((id, i) => {
        const row = rows.find((r) => r.id === id);
        if (!row) return null;
        const gpx = row.gpx_data as unknown as GPXData;
        if (!gpx?.tracks?.[0]?.points?.length) return null;
        return {
          id: `${row.id}-${Date.now()}-${i}`,
          gpx,
          name: row.name,
          color: stageColorAt(startIndex + i),
        } as Stage;
      })
      .filter(Boolean) as Stage[];

    if (stages.length === 0) { toast.error('Vyber alespoň jednu trasu'); return; }
    onPick(stages);
    onOpenChange(false);
    toast.success(`Přidáno ${stages.length} etap`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vybrat uložené trasy</DialogTitle>
        </DialogHeader>

        {!user ? (
          <p className="text-sm text-muted-foreground">Pro výběr uložených tras se přihlas.</p>
        ) : loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Zatím nemáš uložené žádné trasy.</p>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto space-y-2">
            {rows.map((r) => {
              const pos = order.indexOf(r.id);
              const gpx = r.gpx_data as unknown as GPXData;
              const km = gpx?.tracks?.[0]?.points?.length ? totalDistanceKm(gpx) : 0;
              return (
                <button
                  key={r.id}
                  onClick={() => toggle(r.id)}
                  className={`w-full flex items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
                    pos >= 0 ? 'border-primary bg-primary/10' : 'hover:bg-muted/50'
                  }`}
                >
                  <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                    pos >= 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {pos >= 0 ? pos + 1 : <Check className="w-3 h-3 opacity-40" />}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm">{r.name}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{km.toFixed(1)} km</span>
                </button>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Klikej na trasy v pořadí, v jakém se mají přehrát.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zrušit</Button>
          <Button onClick={confirm} disabled={order.length === 0}>Přidat ({order.length})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
