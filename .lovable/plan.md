

## Extrakce logiky z TrailMap.tsx — zapracované připomínky

TrailMap.tsx (1035 řádků) → orchestrační komponenta (~350 řádků) + 3 hooky + 1 prezentační komponenta.

### Struktura

```text
src/hooks/
  useFlythrough.ts      — 3D průlet: state, refs, animační smyčka
  usePhotoMarkers.ts    — foto markery na mapě, auto-open, upload
  useElevationData.ts   — čistě výpočetní hook pro výškový profil

src/components/
  ElevationChart.tsx    — prezentační komponenta (žádná logika)
  TrailMap.tsx          — orchestrace, mapa, POI, slidery
```

### 1. `src/hooks/useFlythrough.ts` (~200 řádků)

**Přesunout state:** `isFlying`, `flySpeed`, `flyRotation`, `flyZoom`, `elevationExaggeration`, `flyingIndex`, `currentGrade`, `mapPitch`

**Přesunout refs:** `flyAnimationRef`, `flySpeedRef`, `flyRotationRef`, `flyZoomRef`, `elevationExaggerationRef`, `lastBearingRef`, `flyMarkerRef`

**Přesunout funkce:** `calculateBearing`, `calculateGrade`, `startFlythrough`, `stopFlythrough`

**API hooku — pojmenované handlery (ne holé settery):**
```typescript
useFlythrough(map: MutableRefObject<Map | null>, gpxData: GPXData | null)

// Vrací:
{
  isFlying, flyingIndex, currentGrade, mapPitch,
  flySpeed, flyRotation, flyZoom, elevationExaggeration,
  // Pojmenované handlery s useCallback (stabilní reference):
  setFlySpeed,        // sync state + ref
  setFlyRotation,     // sync state + ref  
  setFlyZoom,         // sync state + ref
  setElevationExaggeration, // sync state + ref + map.setTerrain
  setMapPitch,        // sync state + map.easeTo
  startFlythrough,
  stopFlythrough,
}
```

Všechny handlery obaleny `useCallback` — stabilní reference, žádné zbytečné re-rendery mapy.

### 2. `src/hooks/usePhotoMarkers.ts` (~130 řádků)

**Přesunout state:** `viewPhoto`, `isPhotoViewOpen`, `originalMapState`, `activePhotoId`

**Přesunout refs:** `photoMarkersRef`, `fileInputRef`

**Přesunout:** useEffect pro vytváření DOM markerů (řádky 224-302), useEffect pro auto-open při animaci (řádky 401-425), `handleArrivedPhoto`, `handlePhotoClose`, `handleBulkPhotoUpload`

**API hooku:**
```typescript
usePhotoMarkers(
  map: MutableRefObject<Map | null>,
  gpxData: GPXData | null,
  photos: PhotoPoint[],
  onAddPhotos: (newPhotos: PhotoPoint[]) => void,
  currentPosition: number,
  animationSettings: AnimationSettings
)

// Vrací:
{
  viewPhoto, isPhotoViewOpen, handlePhotoClose,
  fileInputRef, triggerUpload: () => void
}
```

**Cleanup v useEffect:** Pečlivé odebrání všech DOM markerů + event listenerů při re-renderu. Stávající kód už markery odebírá přes `photoMarkersRef.current.forEach(m => m.remove())` — zachovat tento pattern.

### 3. `src/hooks/useElevationData.ts` (~80 řádků)

Čistě výpočetní — žádné side-effecty, žádné refs.

```typescript
useElevationData(
  gpxData: GPXData | null,
  photos: PhotoPoint[],
  currentPosition: number,
  flyingIndex: number | null,
  elevationExaggeration: number
)

// Vrací:
{ chartData, currentChartPoint, photosOnChart }
```

Uvnitř `useMemo` pro výpočet — přepočítá se jen když se změní vstupy.

### 4. `src/components/ElevationChart.tsx` (~80 řádků)

Prezentační komponenta bez logiky. Přesun JSX z řádků 952-1024.

```typescript
interface ElevationChartProps {
  chartData: Array<{distance: number; elevation: number}>;
  currentChartPoint: {distance: number; elevation: number} | null;
  photosOnChart: Array<{id: string; chartDistance: number; chartElevation: number}>;
}
```

Obalená `React.memo` — re-render jen při změně dat.

### 5. `src/components/TrailMap.tsx` (zůstane ~350 řádků)

**Zůstane:**
- Map inicializace (useEffect řádky 59-114)
- Trail layer rendering (useEffect řádky 116-196)
- Slider position marker (useEffect řádky 199-221)
- POI markery (useEffect řádky 305-399)
- JSX: mapa + slidery + `<ElevationChart>` + `<PhotoViewModal>`

**Orchestrace hooků:**
```typescript
const flythrough = useFlythrough(map, gpxData);
const photoMarkers = usePhotoMarkers(
  map, gpxData, photos, onAddPhotos, 
  currentPosition, animationSettings
);
const elevationData = useElevationData(
  gpxData, photos, currentPosition,
  flythrough.flyingIndex,        // ← závislost: flythrough → elevation
  flythrough.elevationExaggeration
);
```

Pořadí volání respektuje závislosti: `useFlythrough` první (produkuje `flyingIndex`), pak `usePhotoMarkers`, pak `useElevationData` (konzumuje `flyingIndex`).

### Pořadí implementace

1. `useElevationData` + `ElevationChart` (nejjednodušší, žádné side-effecty)
2. `useFlythrough` (self-contained animační smyčka)
3. `usePhotoMarkers` (nejsložitější — DOM markery, event listenery, cleanup)
4. Aktualizace `TrailMap.tsx` — zapojení hooků, odebrání přesunutého kódu

