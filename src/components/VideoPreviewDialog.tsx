import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Share2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string | null;
  videoBlob: Blob | null;
  extension: string;
  filename?: string;
}

export const VideoPreviewDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  videoUrl,
  videoBlob,
  extension,
  filename = 'gpx-prulet',
}) => {
  const fullName = `${filename}.${extension}`;

  const handleDownload = () => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = fullName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleShare = async () => {
    if (!videoBlob) return;
    const file = new File([videoBlob], fullName, { type: videoBlob.type });
    // @ts-ignore — canShare with files isn't in all TS libs
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Můj GPX průlet',
          text: 'Podívej na můj 3D průlet trasou! 🏔️',
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          toast.error('Sdílení se nezdařilo');
        }
      }
    } else {
      handleDownload();
      toast.info('Sdílení v prohlížeči není podporováno — video bylo staženo. Nahraj ho ručně na FB.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Tvůj průlet je hotov 🎬</DialogTitle>
          <DialogDescription>
            Stáhni si video nebo ho rovnou nasdílej. Formát: <strong>.{extension}</strong>
            {extension === 'webm' && ' (Facebook ho přijímá; pro Instagram je potřeba převést na MP4 — např. cloudconvert.com)'}
          </DialogDescription>
        </DialogHeader>

        {videoUrl && (
          <video
            src={videoUrl}
            controls
            autoPlay
            className="w-full rounded-md border bg-black"
            style={{ maxHeight: '60vh' }}
          />
        )}

        <div className="flex flex-wrap gap-2 justify-end pt-2">
          <Button variant="outline" onClick={handleDownload} className="gap-2">
            <Download className="w-4 h-4" />
            Stáhnout
          </Button>
          <Button onClick={handleShare} className="gap-2">
            <Share2 className="w-4 h-4" />
            Sdílet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
