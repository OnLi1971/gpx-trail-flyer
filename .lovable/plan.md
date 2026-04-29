## Přepnutí na satelitní podklad

POI vrstvy (vrcholy, hrady, rozhledny, sedla, hospody) jsou samostatné Maplibre vrstvy nezávislé na podkladu — zůstanou viditelné i na satelitu beze změny. Trasa, marker pozice, 3D terén a nahrávání videa fungují stejně.

### Co se změní

V `src/components/TrailMap.tsx` (řádky ~225–250) v inicializaci mapy:

- Zdroj `cyclosm-tiles` → `satellite-tiles` používající **Esri World Imagery**:
  - URL: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`
  - `tileSize: 256`, `maxzoom: 19`
  - Atribuce: `Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community`
- Vrstva `cyclosm-layer` → `satellite-layer` (type `raster`, source `satellite-tiles`)
- 3D terén (`terrain-dem` + Terrarium DEM) zůstává beze změny — exaggeration slider funguje dál
- `preserveDrawingBuffer: true` zachováno (nutné pro nahrávání videa)

### Co zůstává

- Všech 6 kategorií POI s ikonami a popisky (Overpass API → vlastní vrstvy nad podkladem)
- GPX trasa, gradient podle výšky, marker animované pozice
- 3D průlet, ovládání náklonu/zoomu, nahrávání WebM/MP4
- Výška mapy 500px, jednosloupcové UI
- Sdílení tras, ukládání POI nastavení

### Pamět

Aktualizuji `mem://style/map-konfigurace` — z „Tiles: CycloOSM" na „Tiles: Esri World Imagery (satellite)" a Core řádek v indexu.

### Proč Esri a ne MapTiler

Esri World Imagery nepotřebuje API klíč, má globální pokrytí v dobré kvalitě a je standardně používaná pro tento účel. Pokud bys chtěl ostřejší satelit nebo evropsky lepší rozlišení, můžeme později přejít na MapTiler Satellite (vyžaduje klíč) nebo Mapbox Satellite.