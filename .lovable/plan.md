## Co se ve skutečnosti děje

Při průletu se 7 fotek nezobrazuje sekvenčně, ale „plave přes obraz" — to jsou ve skutečnosti **kruhové thumbnaily markerů** (`new Marker` v `usePhotoMarkers.ts`), které vidíš, jak míjejí kameru. Modal se otevře jen u první fotky a u dalších už ne.

Po čtení `usePhotoMarkers.ts` a `useFlythrough.ts` jsou tři reálné chyby:

### 1. Auto-close timer se nikdy nespustí, pokud se závisí na `animationSettings.autoCloseDelay = 0`
Default v `defaultAnimationSettings` může být 0 (nebo ho `AnimationControls` nastaví posuvníkem na „Ručně zavřít"). Pak se `autoCloseTimerRef` vůbec nenaplánuje, modal zůstane otevřený celý průlet, a guard `if (isPhotoViewOpen || activePhotoId !== null) return;` blokuje všechny další fotky → vidíš jen první.

### 2. `handleArrivedPhoto` má v deps `animationSettings`
Pokaždé, když se kdekoliv změní settings (např. uživatel hýbe slidery během průletu), se přegeneruje closure a ref `handlePhotoCloseRef` se updatuje až o tick později. Pokud při tom právě běží timer, může se zavolat zastaralá verze `handlePhotoClose` → modal se zavře, ale `originalMapState` už je null nebo `setActivePhotoId(null)` nestihne shodit guard před dalším frame detekcí.

### 3. Fotky, které tracker minul „daleko za sebou", se nikdy nepustí
Když je modal 4 s otevřený, tracker mezitím ujede 20+ indexů. Druhá fotka, jejíž `nearestIndex` je v tom intervalu, se v okně `±5` už nikdy neobjeví → zmešká se a zůstává navždy nezobrazená (jen marker plave kolem).

## Oprava

### A) Fronta čekajících fotek místo „buď teď nebo nikdy"
V `usePhotoMarkers.ts` zavést `pendingQueueRef: PhotoPoint[]`. V detekčním efektu:
- Pokud tracker projíždí oknem fotky **a** modal je otevřený → push do fronty (pokud tam ještě není a není v `shownPhotosRef`).
- Pokud tracker už **přejel** `nearestIndex + triggerWindow` fotky, která ještě nebyla zobrazena → taky push do fronty (zachytí pomalý uživatelský close).
- Pokud modal **není** otevřený a fronta není prázdná → vyzvedni první z fronty a zobraz.

### B) `handlePhotoClose` vždy zkontroluje frontu
Po zavření modalu (auto i ruční) se ihned podívej do `pendingQueueRef`. Pokud něco je, naplánuj `handleArrivedPhoto(next)` přes krátký `setTimeout(80 ms)` (aby modal stihl zavřít animaci a `flyTo` zoom-back se rozjel) — pak fotka naskočí.

### C) Vynutit minimální auto-close 2 s, pokud je 0
Pokud `animationSettings.autoCloseDelay === 0` a běží průlet (`isFlying`), použít fallback 4 s — jinak průlet uvázne na první fotce. Manuální mód `0` má smysl jen pro statický slider.

### D) Stabilizovat `handleArrivedPhoto`
Vyhodit `animationSettings` z deps `useCallback` a místo toho číst aktuální hodnoty přes `animationSettingsRef` (sync v `useEffect`). Tím se closure nepřegeneruje při každém posunu slideru.

### E) Drobnost: marker thumbnaily v 3D pitchi „plavou"
S `anchor: 'bottom'` při velkém pitchi MapLibre marker neukotví přesně — vypadá to jako že pluje. Není to bug detekce (ta funguje na GPS souřadnicích), ale uživatelsky matoucí. Skrýt photo markery během `isFlying` (`container.style.display = isFlying ? 'none' : 'flex'`) — během průletu je beztak nahrazuje fullscreen modal.

## Soubory k úpravě

- `src/hooks/usePhotoMarkers.ts` — fronta, fallback auto-close, stabilizace callbacku, skrytí markerů při `isFlying`.
- `mem://features/animace-fotek` — doplnit pravidlo o frontě.

## Co se nemění

- Index-based detekce (`±5` okno) zůstává.
- Slider „Vzdálenost spuštění" 10–500 m a warning toast pro fotky mimo dosah.
- `PhotoViewModal` (Ken Burns, fullscreen).
- `useFlythrough.ts` — 3D průlet se nemění.
