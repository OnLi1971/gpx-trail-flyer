import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppHeader } from '@/components/AppHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, Trash2, Copy, ExternalLink, Map as MapIcon } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';

interface TrailRow {
  id: string;
  name: string;
  slug: string;
  is_public: boolean;
  created_at: string;
}

export default function MyTrails() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [trails, setTrails] = useState<TrailRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('trails')
      .select('id, name, slug, is_public, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      toast.error('Nepodařilo se načíst trasy');
      return;
    }
    setTrails(data || []);
  };

  useEffect(() => { load(); }, [user]);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('trails').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Trasa smazána');
    setTrails((t) => t.filter((x) => x.id !== id));
  };

  const togglePublic = async (id: string, value: boolean) => {
    const { error } = await supabase.from('trails').update({ is_public: value }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    setTrails((t) => t.map((x) => x.id === id ? { ...x, is_public: value } : x));
  };

  const copyLink = async (slug: string) => {
    const url = `${window.location.origin}/trail/${slug}`;
    await navigator.clipboard.writeText(url);
    toast.success('Odkaz zkopírován');
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <h2 className="text-2xl font-bold mb-4">Moje trasy</h2>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : trails.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground space-y-4">
              <MapIcon className="w-12 h-12 mx-auto opacity-50" />
              <p>Zatím nemáš žádné uložené trasy.</p>
              <Button onClick={() => navigate('/')}>Vytvořit první trasu</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {trails.map((trail) => (
              <Card key={trail.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-lg truncate">{trail.name}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(trail.created_at).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2">
                  <Button asChild size="sm" variant="default" className="gap-2">
                    <Link to={`/trail/${trail.slug}`}>
                      <ExternalLink className="w-4 h-4" />
                      Otevřít
                    </Link>
                  </Button>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm">
                    <span className="text-muted-foreground">Veřejné:</span>
                    <Switch checked={trail.is_public} onCheckedChange={(v) => togglePublic(trail.id, v)} />
                  </div>
                  {trail.is_public && (
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => copyLink(trail.slug)}>
                      <Copy className="w-4 h-4" />
                      Kopírovat odkaz
                    </Button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-destructive ml-auto">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Smazat trasu?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Trasa "{trail.name}" a všechny její fotky budou trvale smazány. Tuto akci nelze vrátit.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Zrušit</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(trail.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Smazat
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
