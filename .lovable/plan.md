## Cíl
Overlay graf nadmořské výšky v mapě:
1. Roztáhnout vizuálně na maximum (větší výška, menší vnitřní okraje, plné využití šířky).
2. Více ticků na obou osách (vyšší rozlišení popisků km a m n.m.).
3. Více průhlednosti pozadí, aby mapa pod grafem byla výrazněji vidět.

## Změny

### `src/components/ElevationChart.tsx`
- **Wrapper (overlay variant)**:
  - Pozadí z `bg-white/80` → `bg-white/40` (víc průhledné).
  - `backdrop-blur-md` → `backdrop-blur-sm` (jemnější).
  - `border border-white/40` → `border-white/30`.
  - Stín ztlumit (`shadow-md` místo `shadow-lg`).
  - Výška: `h-28` → `h-40` (výrazně vyšší graf).
- **Vnitřní padding**: `p-2` → `px-2 py-1` (méně mrtvého místa, graf využije plochu).
- **LineChart margin**: `{ top: 5, right: 5, left: 25, bottom: 15 }` → `{ top: 6, right: 10, left: 8, bottom: 4 }` aby čára vyplnila plochu (popisky se vejdou do `width`/`height` os).
- **Osa X**: 
  - `tickCount={4}` → `tickCount={9}` pro hustší krok km.
  - Ponechat `interval="preserveStartEnd"`, `axisLine={false}`, `tickLine={false}`.
  - Drobnější font (`tick={{ fontSize: 10, fill: '#374151' }}`).
- **Osa Y**:
  - `tickCount={3}` → `tickCount={6}`.
  - `width={20}` → `width={32}` aby se vešly 4místné hodnoty.
  - `tick={{ fontSize: 10, fill: '#374151' }}`.
- **Grid**: ponechat, jen `stroke="#9ca3af"` s `strokeOpacity={0.4}` aby byl vidět přes průhledné pozadí.
- **Linie profilu**: `strokeWidth={2}` → `strokeWidth={2.5}` pro lepší kontrast přes mapu.

### `src/components/TrailMap.tsx`
- Bez logických změn. Volitelně zmenšit boční marginy overlay obalu v prezentačním módu (`bottom-6 left-6 right-6` → `bottom-4 left-4 right-4`) aby graf zabíral víc šířky. V normálním režimu nechat `bottom-2 left-2 right-2`.

## Vizuální výsledek
```text
┌──────────────────────────────────────────────┐
│  MAPA                                        │
│ ┌──────────────────────────────────────────┐ │
│ │800┤·····················●················│ │  ← vyšší, průhlednější
│ │600┤   ╱╲     ╱╲___╱╲                    │ │     hustší ticky
│ │400┤__╱  ╲___╱       ╲__                 │ │
│ │   0  4  8  12 16 20 24 28 32 km         │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

## Soubory
- `src/components/ElevationChart.tsx` — wrapper, marginy, tickCount, fonty.
- `src/components/TrailMap.tsx` — drobná úprava marginů overlay v prezentačním módu (volitelné).
