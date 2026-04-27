## Cíl

Přepnout spouštění fotek během 3D průletu z detekce polohy na **čas v sekundách od startu průletu**. Každá fotka má vlastní `triggerSec`, nastavitelný sliderem. Značky (kroužky s miniaturou) se na mapě umístí na bod trasy odpovídající danému času (ne na původní GPS pozici fotky).

## Co se změní z pohledu uživatele

- V panelu nad mapou přibude sekce **„Fotky na trase"** se seznamem nahraných fotek.
- U každé fotky: miniatura, název, **slider 0 s – délka průletu** + číselný input, tlačítko Smazat.
- Při nahrání nové fotky se `triggerSec` nastaví automaticky tak, aby se fotky rovnoměrně rozprostřely (1. v 1/(N+1) délky, 2. ve 2/(N+1)…). Uživatel pak doladí sliderem.
- Během průletu fotka naskočí přesně v zadané sekundě (modal fullscreen, pak se zavře a pokračuje další).
- Značka fotky na 2D mapě sedí přesně na trase — v bodě, kterým průlet projíždí v `triggerSec`.
- Slider „Vzdálenost spuštění" v UI **zmizí** (už nemá smysl). Slider „Doba zobrazení" zůstává.

## Technické změny

### 1. `src/types/gpx.ts`
- Přidat pole `triggerSec?: number` do `PhotoPoint`.
- Z `AnimationSettings` odstranit `threshold` (a vyhodit ho i z `defaultAnimationSettings`).

### 2. Délka průletu — jeden zdroj pravdy
V `useFlythrough.ts` přidat výpočet **`flyDurationSec`** = předpokládaná celková délka průletu v sekundách na základě `flySpeed`, počtu bodů a délky kroku (přesně podle vzorce v `animateStep`: `totalPoints / step * (duration*0.8 + duration)/1000`). Vystavit jako součást návratové hodnoty hooku, aby UI vědělo, co dát do max sliderů.

Také vystavit **`flyStartTimestamp: number | null`** (`Date.now()` při startu animace, resetuje se na `null` při stop) — fotka se bude spouštět podle `Date.now() - flyStartTimestamp >= triggerSec * 1000`.

### 3. `src/hooks/usePhotoMarkers.ts` — kompletní přepis logiky triggeru
- Smazat: `arrivalRadiusMeters`, `photoTrackMap` (Haversine), warningy „fotka je X m od trasy", logiku detekce přes `nearestIndex ± triggerWindow`.
- Přidat nový `useEffect` poslouchající `flyStartTimestamp` a `currentPosition` (případně tikající přes `requestAnimationFrame` nebo interval po dobu průletu): pro každou fotku s `triggerSec` zkontrolovat, zda už uplynulo `triggerSec * 1000` ms od startu průletu, a pokud ano a fotka ještě nebyla zobrazena → zařadit do `pendingQueueRef` (existující fronta zůstává, sekvenční přehrávání funguje dál).
- Mimo průlet (klasický slider 0–100 %): zobrazit fotku, když `currentPosition / 100 * ANIMATION_DURATION >= triggerSec * 1000` — analogicky.
- **Pozice značky na mapě**: místo `[photo.lon, photo.lat]` použít `getTrackPointAtTime(triggerSec, flyDurationSec, track.points)` — vrátí bod trasy v odpovídajícím poměru (`index = round(triggerSec / flyDurationSec * (points.length - 1))`). Fallback na původní GPS pozici, pokud `triggerSec` není definován (zpětná kompatibilita s uloženými trasami).

### 4. Auto-přiřazení času novým fotkám
V `Index.tsx` v `setPhotos(prev => [...prev, ...newPhotos])` před uložením doplnit `triggerSec` u nových fotek tak, aby se rovnoměrně rozprostřely v rámci `flyDurationSec` (nebo defaultní 60 s, pokud průlet ještě neběžel). Vzorec: pro N celkových fotek po přidání → `triggerSec_i = (i+1) / (N+1) * flyDurationSec`.

### 5. Nová UI komponenta `PhotoTimeEditor`
- Vytvořit `src/components/PhotoTimeEditor.tsx`.
- Props: `photos`, `flyDurationSec`, `onChangeTriggerSec(id, sec)`, `onRemove(id)`.
- Seznam fotek s miniaturou, sliderem (`min=0`, `max=flyDurationSec`, `step=0.5`), inputem typu number a křížkem pro smazání.
- Zobrazí se v `Index.tsx` mezi `AnimationControls` a `TrailMap`, jen když `photos.length > 0`.

### 6. `src/components/AnimationControls.tsx`
- Smazat blok slideru „Vzdálenost spuštění" (řádky kolem `threshold`).
- Slider „Doba zobrazení" (`autoCloseDelay`) zůstává beze změny.

### 7. Propagace `flyDurationSec` a `flyStartTimestamp`
- `useFlythrough` je voláno v `TrailMap.tsx`. Přidat nové návratové hodnoty do props prostupu zpět do `Index.tsx` přes nový callback `onFlyStateChange?({ flyDurationSec, flyStartTimestamp, isFlying })`, případně lift hooku — preferovaně callback, aby se nelámala stávající architektura.
- `usePhotoMarkers` (volaný v `TrailMap.tsx`) dostane nové parametry `flyStartTimestamp` a `flyDurationSec`.

### 8. Migrace starých uložených tras
V `usePhotoMarkers` při zpracování fotek: pokud `triggerSec` chybí, **na úrovni komponenty se nedopočítává** (značka padne na původní GPS, fotka se nespustí během průletu). V `Index.tsx` při načtení uložené trasy s fotkami bez `triggerSec` zavolat stejný auto-rozprost vzorec a doplnit. Pro `SharedTrail.tsx` totéž (read-only — jen pro zobrazení během průletu, neukládá zpět).

## Soubory k úpravě

- `src/types/gpx.ts` — `PhotoPoint.triggerSec`, odstranit `threshold` z `AnimationSettings`
- `src/hooks/useFlythrough.ts` — vystavit `flyDurationSec`, `flyStartTimestamp`
- `src/hooks/usePhotoMarkers.ts` — přepis triggeru na čas, pozice značky na trase
- `src/components/AnimationControls.tsx` — odstranit slider „Vzdálenost spuštění"
- `src/components/PhotoTimeEditor.tsx` — **nový** soubor
- `src/components/TrailMap.tsx` — propsat `flyDurationSec`/`flyStartTimestamp` do `usePhotoMarkers`, přidat `onFlyStateChange` callback
- `src/pages/Index.tsx` — auto-přiřazení `triggerSec`, vykreslení `PhotoTimeEditor`, držení stavu průletu pro editor
- `src/pages/SharedTrail.tsx` — totéž auto-doplnění při načtení (bez editoru)
- `mem://features/animace-fotek` — aktualizovat popis na časový trigger

## Co se NEmění

- EXIF extrakce při nahrávání zůstává (GPS se ukládá do `lat`/`lon` jako fallback).
- Modal `PhotoViewModal`, fronta `pendingQueueRef`, auto-close, fullscreen chování během průletu.
- Logika 3D průletu (`useFlythrough.startFlythrough`/`animateStep`).
