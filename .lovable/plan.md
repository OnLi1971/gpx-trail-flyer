# Export trasy jako video

## Co se změní

1. **V aplikaci přibyde tlačítko „Vytvořit video"** u uložené trasy. Otevře dialog, kde si vybereš:
   - Formát: **9:16 vertikálně** (mobil/Reels) nebo **16:9 horizontálně** (YouTube/web)
   - Volitelný titulek (default: název trasy + rok, např. „Okolo Lovoše 2026")
2. **Render poběží na serveru** (Lovable Cloud edge function s Remotion). Čekáš ~30–90 s, pak ti spadne MP4 do seznamu „Moje videa" s odkazem ke stažení.
3. **Oprava současného průletu** v appce: fotka se objeví **přesně ve chvíli, kdy tracker dorazí** na souřadnice (ne dřív) a zůstane otevřená plné 4 s. Toto je nezávislý fix bez ohledu na video.

## Struktura videa

```
[0–2s]    INTRO            Titulek „Okolo Lovoše 2026" + jméno trasy
                            Decentní fade-in přes mapu se zvýrazněnou trasou

[2–22s]   PRŮLET            3D animovaný průlet po trase (statický render snímků mapy)
                            Když tracker dorazí k fotce → fotka přes celou obrazovku
                            na 4 s s jemným Ken Burns efektem, pak fade pryč
                            Pokud jsou ≥2 fotky do 100 m od sebe → koláž 2–4 fotek

[22–28s]  PŘEHLED TRASY     Celá trasa zobrazená naráz, kamera pomalu obletí
                            Statistiky: vzdálenost, převýšení, počet fotek
                            Fade-out
```

Délka se přizpůsobí délce trasy a počtu fotek (cca 25–40 s).

## Jak to bude fungovat technicky

**Pro tebe (uživatele):**
- Klikneš „Vytvořit video" → vybereš formát → potvrdíš
- Backend zkompiluje video, ty vidíš stav („Připravuje se… Renderuje… Hotovo")
- MP4 se uloží do cloudu, můžeš si ho stáhnout, sdílet odkaz, nebo smazat

**Pod kapotou:**
- **Nová tabulka `trail_videos`** (trail_id, format, status, video_url, created_at)
- **Nový storage bucket `trail-videos`** (veřejný read, owner write)
- **Nová edge function `render-trail-video`**: spustí render přes Remotion (Node runtime), nahraje MP4 do bucketu, updatne řádek v `trail_videos`
- **Mapové snímky pro průlet**: edge function nageneruje statické dlaždice trasy přes MapTiler Static API (kamera pohled za pohledem) — Remotion je pak složí do plynulé animace s overlay GPX křivky
- **Zdroj fotek**: bere se z `trail_photos` v cloudu (už existuje)
- **Stav v appce**: nová stránka `/my-videos` nebo sekce v `MyTrails`, polling stavu každých 3 s

## Oprava timingu v live aplikaci (mimo video)

V `usePhotoMarkers.ts` práh aktivace fotky závisí na `latDiff < threshold && lonDiff < threshold` (current threshold 0.005° ≈ 500 m). To je důvod, proč fotka „naskočí dřív".

- Změna na **kruhový test pomocí Haversine vzdálenosti** s prahem cca **30 m** (nastavitelné).
- Auto-close timer 4 s teď není respektován kvůli `flyTo` zoomu, který spouští `originalMapState` resetu — opraví se tak, že timer poběží od momentu skutečného otevření modalu, ne od plánu.

## Co teď nedělám

- Hudba na pozadí (může přijít později)
- Vlastní úpravy stylu titulků / přechodů
- Stahování videa pro neuložené trasy (musíš nejdřív uložit do cloudu)

## Soubory ke změně

- **Nové**:
  - `supabase/functions/render-trail-video/index.ts` (orchestrace renderu)
  - `supabase/functions/render-trail-video/remotion/` (Remotion projekt: Root, MainVideo, scény Intro/Flythrough/Overview)
  - migrace: tabulka `trail_videos` + bucket `trail-videos` + RLS
  - `src/components/CreateVideoDialog.tsx`
  - `src/pages/MyVideos.tsx` (nebo sekce v `MyTrails.tsx`)
  - `src/hooks/useVideoRender.ts` (volání funkce + polling stavu)
- **Upravené**:
  - `src/pages/MyTrails.tsx` — tlačítko „Vytvořit video" u každé trasy
  - `src/hooks/usePhotoMarkers.ts` — Haversine threshold, fix 4s timeru
  - `src/App.tsx` — route `/my-videos`
  - `src/components/AppHeader.tsx` — link na „Moje videa"

## Otevřené body, které vyřeším při implementaci

- Render trvá u dlouhých tras déle — pokud edge function přesáhne timeout, rozdělím render na chunks (intro / flythrough / overview) a spojím přes ffmpeg.
- MapTiler má rate limity na Static API — pro průlet udělám max 60 snímků/trasu (1 snímek / 0.3 s videa) a interpoluju mezi nimi v Remotion.
