## Cíl

1. Graf nadmořské výšky a km přesunout **dovnitř** mapy jako poloprůhledný overlay (dnes je pod mapou jako samostatný panel).
2. Odstranit modré tečky fotek z grafu — graf bude ukazovat jen profil + červenou aktuální pozici.

## Změny

### `src/components/ElevationChart.tsx`
- Odstranit veškerou logiku okolo modrých teček fotek: props `photosOnChart`, `onPhotoKmChange`, `ReferenceDot` mapování, drag handlery (`onPointerDown/Move/Up`, `xFromEvent`, `draggingId`) i nápovědu „Tip: modré tečky můžeš přetáhnout…".
- Komponenta zůstane jen s `chartData` + `currentChartPoint` (červená tečka aktuální polohy).
- Upravit obal pro overlay režim:
  - Místo bílého panelu s `border-t-2` použít poloprůhledné pozadí `bg-white/80 backdrop-blur-md` se zaoblenými rohy a jemným stínem.
  - Výška kompaktnější (≈ `h-28`), aby nezakrývala mapu.
  - Volitelný prop `variant?: 'overlay' | 'panel'` pro budoucí flexibilitu (výchozí `overlay`).

### `src/components/TrailMap.tsx`
- Přesunout `<ElevationChart …/>` z místa pod mapou (ř. 1102–1110) do kontejneru mapy `<div className="relative w-full h-[500px]">` (ř. 611) jako absolutně pozicovaný overlay:
  - `absolute bottom-2 left-2 right-2 z-10 pointer-events-none` na obal, samotná karta s `pointer-events-auto`.
  - Aby nebránila interakci s mapou všude jinde.
- Odebrat předávání `photosOnChart` a `onPhotoKmChange` do grafu (přetahování fotek se nadále dělá v `PhotoTimeEditor` pod mapou — beze změny).

### `src/hooks/useElevationData.ts`
- Pole `photosOnChart` můžeme nechat ve výpočtu (používá se případně jinde) nebo zjednodušit. Doporučení: nechat hook beze změny, jen ho v `TrailMap` ignorovat — bezpečné a minimálně invazivní.

## Vizuální výsledek

```text
┌──────────────────────────────────────────┐
│  MAPA (3D / 2D)             [3D] [Rec]   │
│                                          │
│         🚴 ━━━━━━━━━━━ 🏔                │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ ╱╲    profil výšky      ●          │  │  ← overlay graf
│  │╱  ╲__╱╲___________╱╲___╱           │  │     (poloprůhledný)
│  │ 0km          15km         30km     │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

Modré tečky fotek pryč. Pod mapou zůstává `PhotoTimeEditor` pro úpravu km fotek.
