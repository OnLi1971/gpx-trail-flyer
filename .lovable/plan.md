
## POI markery (vrcholy + obce) zase chybí

### Diagnóza

V `overpassApi.ts`:
- `out body 50;` — Overpass vrátí **max 50** elementů celkem pro celou bbox. Pro delší trasy se po filtraci `filterPOIsNearTrack` (2 km od trasy) může stát, že žádný relevantní vrchol neprojde — vrchy jsou často mimo úzký pás kolem trasy, ale obce dominují počtem.
- Query nepokrývá `place=hamlet` (malé osady) — v horách často jediné, co je v okolí.

### Změny v `src/utils/overpassApi.ts`

- Zvýšit limit z `out body 50;` na `out body 300;`
- Rozšířit place regex: `place~"city|town|village|hamlet"`
- Rozdělit limity v query — peaks zvlášť (až 100), places zvlášť (až 200), aby vrcholy nebyly přebity obcemi

```
node["natural"="peak"]["name"](${bbox});
out body 100;
node["place"~"city|town|village|hamlet"]["name"](${bbox});
out body 200;
```

- Přidat `console.log` po načtení: počet peaks, počet places, počet po filtraci — pro snadné ověření v konzoli

### Bez změny

- `TrailMap.tsx` POI rendering zůstává — kód markerů je správný
- Threshold 2 km zůstává (rozumný kompromis mezi šumem a pokrytím)
