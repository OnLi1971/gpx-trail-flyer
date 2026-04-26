import { Link, useNavigate } from 'react-router-dom';
import { Mountain, LogIn, LogOut, FolderOpen, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

interface AppHeaderProps {
  onSaveClick?: () => void;
  canSave?: boolean;
}

export const AppHeader = ({ onSaveClick, canSave }: AppHeaderProps) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-gradient-trail flex items-center justify-center flex-shrink-0">
            <Mountain className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">GPX Trail Flyer</h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
              Visualizace a animace GPS tras
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              {canSave && (
                <Button size="sm" onClick={onSaveClick} className="gap-2">
                  <Save className="w-4 h-4" />
                  <span className="hidden sm:inline">Uložit</span>
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => navigate('/trails')} className="gap-2">
                <FolderOpen className="w-4 h-4" />
                <span className="hidden sm:inline">Moje trasy</span>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => signOut()} title={user.email || ''}>
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => navigate('/auth')} className="gap-2">
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Přihlásit</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
