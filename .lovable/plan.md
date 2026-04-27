## Problém

Fotky teď fungují přes „trigger + modal": když průlet dorazí k jejich km, schovají se markery, kamera odzoomuje, otevře se modal s fotkou, pak zase zpět. To je křehké (timing, zoom, pořadí, autoclose) a vizuálně se chovají úplně jinak než vrcholy, které prostě **stojí** nad trasou jako popisek na tyčce a drží pozici po celou animaci.

## Řešení: fotky jako POI vrcholy

Zahodíme celé „trigger + modal" chování pro fotky během průletu. Fotka bude **statický marker** přesně toho stylu jako vrchol — kartička (obdélník s miniaturou + popisem) sedící na konci tyčky, tyčka jde kolmo dolů na bod trasy daný `triggerKm`. Marker je viditelný pořád: před průletem, během 3D průletu i po. MapLibre marker držený na `[lon, lat]` automaticky drží svou geo-pozici, když se kamera hýbe a naklání — přesně jako to dělají vrcholy.

```text
   ┌─────────────────────────┐
   │ [img]  Vrchol Sněžka    │   ← kartička (obdélník)
   │        u jezera         │
   └────────────┬────────────┘
                │                  ← tyčka
                │
                •                  ← bod na trase (triggerKm)
   ═══════════════════════════     ← trasa
```

## Co se mění

### 1. `usePhotoMarkers.ts` — markery jako POI

- Marker fotky překreslit ve stylu peak POI: bílá karta s miniaturou (~48×48 px) vlevo, vpravo popis fotky. Border + shadow + zaoblení jako vrchol. Pod kartou tyčka (gradient/jemná čára) + tečka na trase. `anchor: 'bottom'`, `pointerEvents: 'none'` na tyčce, `auto` na kartě (pro klik).
- **Marker je viditelný vždy** — odstranit `display:none` při `isFlying` a celý effect, který display přepíná.
- Pozice markeru = bod trasy nalezený přes `indexAtKm(cumKm, triggerKm)` (zachováno).
- Klik na kartu = otevře `PhotoViewModal` (manuální prohlížení mimo animaci). Žádné auto-otevření.

### 2. Odstranit trigger logiku

- Smazat effect „Trigger podle ujeté vzdálenosti (km)" (řádky ~200–230).
- Smazat `handleArrivedPhoto`, `handlePhotoClose` chain pro auto-otevírání během průletu, `pendingQueueRef`, `shownPhotosRef`, `autoCloseTimerRef`, `originalMapState`, `activePhotoId`, `flyTo` na fotku.
- Zachovat: `viewPhoto`, `isPhotoViewOpen`, `handlePhotoClose` — ale jen jako jednoduchý open/close pro klik na marker.
- Z parametrů hooku odstranit `flyingIndex`, `isFlying`, `_flyStartTimestamp`, `_flyDurationSec`, `currentPosition`, `animationSettings` (nejsou už potřeba).

### 3. `PhotoPiP.tsx`

- Komponenta zůstane jako je (nepoužitá pro auto-trigger). Pokud ji nikdo neimportuje, smazat.

### 4. `TrailMap.tsx`

- Volání `usePhotoMarkers(...)` zjednodušit — bez flythrough a position parametrů.
- `onFlyStateChange` zůstává (potřebuje ho `PhotoTimeEditor` rodič? — zkontrolovat; pokud jen pro starý editor sekund, dá se i ponechat, neškodí).

### 5. Bez změny

- `triggerKm` v `PhotoPoint` zůstává — určuje, **kam na trase** marker patří.
- `PhotoTimeEditor` (km input + drag tečky v ElevationChart) zůstává — slouží k přesnému umístění markeru na trasu.
- `Index.tsx`, `SharedTrail.tsx` — žádné změny propsů kromě toho, že některé už nebudou potřeba.

## Efekt pro uživatele

- Fotky se na mapě objeví hned po nahrání jako pěkné kartičky na tyčkách, stejně jako vrcholy.
- Během 3D průletu **zůstanou viset** nad trasou na svých místech, kamera kolem nich přeletí a uvidíš je v kontextu krajiny.
- Klik na kartu fotky kdykoliv otevře plný náhled (modal).
- Žádné nečekané zoomy, žádné modaly skákající uprostřed průletu, žádný timing bug.

## Soubory k úpravě

- `src/hooks/usePhotoMarkers.ts` — přepsat marker styl, smazat trigger logiku
- `src/components/TrailMap.tsx` — zjednodušit volání hooku
- `src/components/PhotoPiP.tsx` — pravděpodobně smazat
- (volitelně) `src/types/gpx.ts` — `autoCloseDelay` v animationSettings už není pro fotky relevantní, ale necháme
