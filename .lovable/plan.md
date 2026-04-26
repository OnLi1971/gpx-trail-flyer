## Oprava POI tyček (vrcholy + obce)

### Diagnóza
Markery se generují, ale jsou špatně viditelné/umístěné kvůli:
- HTML markery v MapLibre nemají depth-test → při 3D náklonu jsou schované za terénem nebo špatně zarovnané
- `pointer-events: none` brání kliknutí
- Z-index může kolidovat s ostatními vrstvami
- Nepřehledné na 2D mapě (malé, splývající)

### Změny v `src/components/TrailMap.tsx` — POI rendering blok

**Vizuál vrcholů:**
- Větší ikona ⛰️ (16px), tučnější rámeček, výraznější hnědá barva
- Delší tyčka (28px) s gradientem (tmavší dole)
- Větší tečka u základny (8px)
- `z-index: 5` na celém elementu

**Vizuál obcí:**
- Bílé pozadí s vyšší opacitou (0.95)
- Tečka u základny i pro obce (4px, šedá)
- Krátká tyčka (12px)

**Pointer events:**
- Povolit `pointer-events: auto` na bublině (tooltip-like) pro budoucí interakci
- Tyčka a tečka zůstávají `none`

**MapLibre options:**
- Přidat `pitchAlignment: 'map'` na vrchol tyčky? — Ne, HTML markery to neumí. Místo toho zachovat `anchor: 'bottom'` a přijmout, že při velkém pitchu mohou být schované za kopci (omezení MapLibre HTML markerů).

### Diagnostika
- Po načtení vypsat do konzole první 3 POI s lat/lon, abychom ověřili, že se vůbec přidávají na správné místo
- Zkontrolovat v konzoli logy `[Overpass]` — pokud `After 2km filter: 0/X`, je problém v datech, ne v renderingu

### Bez změny
- `overpassApi.ts` — query je v pořádku po minulém fixu
- Filtrace 2 km zůstává
- Anchor `bottom` zůstává

### Co tím nevyřešíme
3D náklon přes 45° může stále některé tyčky schovat za kopci — to je omezení HTML markerů v MapLibre. Pokud bude vadit, dalším krokem by byl převod POI na nativní symbol layer (text + ikona z geojson sourcu), který respektuje terrain depth.
