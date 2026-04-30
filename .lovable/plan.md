# Plán: Statistiky trasy z mapových dat (Top 3)

Přidám pod mapu novou kartu **„Trasa v číslech"** se třemi statistikami získanými z OpenStreetMap pomocí Overpass API (stejný princip jako stávající POI):

1. **Povrch** — % rozdělení (asfalt, šotolina, lesní cesta, …)
2. **Turistické značky KČT** — % po značených cestách, rozdělené podle barev
3. **Krajinný pokryv** — % les / louka / pole / zástavba

## Jak to bude vypadat

Pod stávajícím blokem mapy přibude nová karta `TrailStats` se třemi sekcemi:

```text
┌─ Trasa v číslech ──────────────────────┐
│                                         │
│  Povrch                                 │
│  ████████░░ 65 % asfalt                 │
│  ███░░░░░░░ 22 % šotolina               │
│  █░░░░░░░░░ 13 % lesní cesta            │
│                                         │
│  Turistické značení                     │
│  ██████░░░░ 58 % červená KČT            │
│  ███░░░░░░░ 27 % modrá KČT              │
│  █░░░░░░░░░ 15 % bez značky             │
│                                         │
│  Krajina kolem trasy                    │
│  ███████░░░ 72 % les                    │
│  ██░░░░░░░░ 18 % louky a pole           │
│  █░░░░░░░░░ 10 % zástavba               │
│                                         │
│  [↻ Načíst znovu]                       │
└─────────────────────────────────────────┘
```

Každá sekce = nadpis + horizontální stacked bar nebo seznam barevných řádků s procenty. Žádné koláčové grafy (drží se minimalistický single-column UI).

## Stavy

- **Načítání** — skeleton/spinner s textem „Analyzuji trasu podle map…"
- **Hotovo** — zobrazené statistiky
- **Chyba** — hláška + tlačítko „Zkusit znovu"
- **Auto-fetch** — proběhne automaticky po nahrání GPX (paralelně s načítáním POI), ne při každém pohybu po mapě

## Technické detaily

### Nový soubor `src/utils/trailStats.ts`

Tři funkce, každá vrací `{ label, percent, color }[]`:

```ts
fetchSurfaceStats(trackPoints) → SurfaceStat[]
fetchHikingTrailStats(trackPoints) → TrailMarkStat[]
fetchLandcoverStats(trackPoints) → LandcoverStat[]
```

**Princip pro povrch a značky** (matchování trasy s cestami):

1. Trasu zjednodušit Douglas-Peucker algoritmem nebo prostě vzít každý N-tý bod (cíl: ~50–150 bodů)
2. Spočítat bbox trasy + buffer 200 m
3. Overpass query:
   ```
   [out:json][timeout:30];
   way["highway"](bbox);
   out geom;
   ```
4. Pro každý úsek trasy (segment mezi sousedními zjednodušenými body) najít **nejbližší OSM way** (vzdálenost bodu od úsečky, threshold ~25 m)
5. Délku úseku přičíst do bucketu podle tagu `surface` (resp. `osmc:symbol` / `route=hiking` pro značky)
6. Spočítat % z celkové délky trasy

**Buckety pro povrch** (mapování OSM → uživatelské):
- `asphalt`, `paved`, `concrete` → **Asfalt**
- `gravel`, `fine_gravel`, `compacted`, `pebblestone` → **Šotolina**
- `dirt`, `ground`, `earth`, `mud` → **Lesní/polní cesta**
- `grass` → **Tráva**
- `paving_stones`, `cobblestone`, `sett` → **Dlažba**
- `sand` → **Písek**
- chybí tag → **Neznámý**

**Buckety pro KČT značky** (z relací `route=hiking` + `osmc:symbol`):
- Query si vyžádá relace značených tras protínající bbox a jejich členské ways
- Barva se zjistí z tagu `colour` nebo `osmc:symbol` (např. `red:white:red_bar`)
- Buckety: **Červená**, **Modrá**, **Zelená**, **Žlutá**, **Bez značky**

**Princip pro krajinný pokryv** (jiný — kolem trasy, ne přesně na ní):

1. Vytvoří se buffer ~50 m kolem každého zjednodušeného bodu
2. Overpass query na polygony:
   ```
   way["landuse"](bbox);
   way["natural"~"^(wood|water|grassland|scrub|heath)$"](bbox);
   relation["landuse"](bbox);
   ```
3. Pro každý bod trasy se zjistí, do jakého polygonu spadá (point-in-polygon test)
4. Buckety podle tagů:
   - `forest`, `wood` → **Les**
   - `meadow`, `grassland`, `farmland`, `orchard` → **Louky a pole**
   - `residential`, `industrial`, `commercial` → **Zástavba**
   - `water` → **Vodní plocha** (jen pokud >5 %)
   - jinak → **Ostatní**

### Nová komponenta `src/components/TrailStats.tsx`

Props: `gpxData: GPXData`. Uvnitř vlastní `useEffect` který se spustí při změně `gpxData` a paralelně načte všechny 3 statistiky pomocí `Promise.allSettled` (když jedna selže, ostatní se zobrazí).

UI: tři sekce s nadpisem + řádky `[barevný čtvereček] [název] [progress bar] [%]`.

### Integrace v `src/pages/Index.tsx`

Pod blok `<TrailMap />` přidat:
```tsx
{gpxData && <TrailStats gpxData={gpxData} />}
```

### Cache

- **Per-session**: výsledek se cachuje v `useRef` podle hash trasy (první/poslední bod + počet bodů). Při změně rychlosti/náklonu/POI se nepřepočítává.
- **DB cache** (rozšíření do budoucna, **není v tomto plánu**): mohly by se uložit do tabulky `trails` jako JSONB sloupce `surface_stats`, `hiking_stats`, `landcover_stats`. **Pro teď se počítá vždy znovu po načtení GPX.**

### Limity a fallbacky

- **Timeout** Overpass query: 30 s, při chybě 2 retry s rotací endpointů (recyklovat logiku z `overpassApi.ts`)
- **Délka trasy >100 km**: trasa se víc decimuje (krok 200 m místo 50 m), ať query nepadne
- **Žádná shoda nalezena** (odlehlá trasa): zobrazí se „Nepodařilo se získat data z mapy"
- **Tag `surface` chybí na >50 % cest**: bucket „Neznámý" se zobrazí s vysvětlivkou „cesta nemá v mapách určený povrch"

### Co se NEPŘIDÁVÁ (mimo rozsah)

- Ukládání statistik do DB (zatím se počítá ad-hoc)
- Statistiky pro readonly sdílené trasy (`SharedTrail.tsx`) — přidá se v dalším kroku, pokud se osvědčí
- Detailní seznam obcí, řek, cyklotras (zmiňováno v předchozí odpovědi — necháváme na později)

## Soubory, kterých se to dotkne

**Nové:**
- `src/utils/trailStats.ts` — fetch + parsování OSM dat, point-to-line a point-in-polygon výpočty
- `src/components/TrailStats.tsx` — UI komponenta

**Upravené:**
- `src/pages/Index.tsx` — přidat `<TrailStats />` pod `<TrailMap />`

**Memory:**
- nový záznam `mem://features/statistiky-trasy` + odkaz v `mem://index.md`
