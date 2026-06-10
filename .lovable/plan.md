## Co přidám

Do finální karty `TrailSummaryCard` přibude sekce **Počasí v den túry** s:
- průměrná / min / max teplota (°C)
- průměrný a maximální vítr (km/h) + převažující směr
- celkové srážky (mm)
- ikonka převažujícího stavu (slunce / mraky / déšť / sníh) podle weathercode

## Jak to získám

**Open-Meteo Archive API** — zdarma, bez API klíče, bez registrace.

- Endpoint: `https://archive-api.open-meteo.com/v1/archive`
- Vstup: `latitude`, `longitude` (střed trasy nebo první bod), `start_date` = `end_date` (z `gpxData.tracks[0].points[0].time`), proměnné: `temperature_2m_max/min/mean`, `windspeed_10m_max`, `winddirection_10m_dominant`, `precipitation_sum`, `weathercode`.
- Data jsou dostupná s ~2denním zpožděním. Pro novější dny použiju forecast endpoint `https://api.open-meteo.com/v1/forecast` s `past_days`.

## Kde to bude

1. Nový util `src/utils/weatherApi.ts` — funkce `fetchTrailWeather(lat, lon, date)` vrací typovaný objekt nebo `null`.
2. `TrailSummaryCard.tsx` — nová sekce pod statistikami, vedle povrchu. Loading spinner, fallback "Počasí pro tento den není dostupné" když:
   - GPX nemá timestamps
   - datum je mimo dosah API
   - API selže

## Cache

Výsledek zacacheuju do `trails.cached_pois` jako nové pole `cached_weather` (jsonb) + `weather_cached_at` na úrovni trasy — migrace přidá dva sloupce, ať se to nestahuje při každém otevření.

## Edge cases

- GPX bez `time` → sekce se nezobrazí, místo toho jen jemný hint "GPX neobsahuje datum, počasí nelze dohledat".
- Pokud je trasa delší než 1 den (vícedenní), vezmu rozsah `start_date`..`end_date` a zprůměruju.

Žádné secrety, žádný backend kód — vše z frontendu.
