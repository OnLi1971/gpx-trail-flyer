## Závěr průletu: orbitální 3D rotace + statistická karta

### Co se změní
Místo zploštění do 2D pohledu shora po dokončení průletu:

1. **Orbit fáze (~6 s)** – kamera zůstane v 3D (pitch ~60°), `fitBounds` na celou trasu, pak plynulá rotace bearing 0° → 360° kolem středu trasy. Terén a nakreslená trasa zůstanou viditelné.
2. **Fade-in karta (~0.5 s)** – po skončení orbitu se přes mapu objeví poloprůhledná karta se shrnutím trasy. Mapa pomalu rotuje dál na pozadí jako kulisa.
3. **Karta zůstane** dokud uživatel nezavře (×) nebo nespustí nový průlet.

### Obsah karty
- Název trasy
- Vzdálenost, převýšení ↑/↓, max. nadm. výška
- Doba průletu / odhad času
- Počet POI podle kategorií (ikonky)
- Mini výškový profil (reuse `ElevationChart` v kompaktní variantě)

### Technické detaily

**`src/hooks/useFlythrough.ts`** – v `stopFlythrough` při `reason === 'finished'`:
- nahradit současný `easeTo({pitch:0})` + `fitBounds` za:
  - `fitBounds(bounds, { padding: 60, pitch: 60, bearing: 0, duration: 1500 })`
  - po dokončení spustit `requestAnimationFrame` smyčku, která inkrementuje `bearing` (~60°/s) přes `map.setBearing()` – uložit handle do nového `orbitAnimationRef`
- exponovat nový state `showSummary: boolean` a `setShowSummary`
- nastavit `setShowSummary(true)` ~1.5 s po startu orbitu
- v `stopFlythrough('stopped')` a při startu nového průletu: zrušit orbit, `setShowSummary(false)`

**`src/components/TrailMap.tsx`**:
- nová komponenta `TrailSummaryCard` (nový soubor `src/components/TrailSummaryCard.tsx`) – fixed overlay nad mapou, poloprůhledné pozadí (`bg-background/85 backdrop-blur`), fade-in animace, close tlačítko
- vykreslit ji podmíněně podle `showSummary` z hooku
- předat jí už spočtené statistiky (distance, elevation gain/loss, max ele, poi counts) + `gpxData` pro mini profil
- respektovat barvu/styl trasy (už máme `trailColor`, `trailStyle`, `trailWidth`) pro mini graf

### Mimo rozsah
- Nahrávání videa zůstane funkční – `preserveDrawingBuffer` nedotčeno, orbit běží přes stejné `map.setBearing`, takže se nahraje i závěrečná rotace. Karta je DOM overlay, do videa se nepromítne (to je v pořádku – uživatel ji v CapCutu nepotřebuje).
