

## Vylepšení fotek na trase - náhledové miniatury místo modrých teček

Aktuálně jsou fotky zobrazeny jako malé modré kolečka na mapě. Navrhuju je nahradit efektními miniaturami fotek.

### Co se změní

**Foto markery na mapě** (řádky 270-282 v `TrailMap.tsx`):
- Místo modrého kolečka (`w-6 h-6 bg-blue-500 rounded-full`) zobrazit skutečný náhled fotky jako kulatý thumbnail s bílým rámečkem
- Při hoveru se miniatura zvětší (scale efekt) a zobrazí se popisek
- Kliknutím se otevře detail fotky jako dosud

**Vizuální styl:**
```text
  ┌─────────┐
  │  📷     │  ← kulatý thumbnail fotky (40x40px)
  │  mini   │     bílý border 2px, box-shadow
  └────┬────┘
       │        ← malá tyčka (jako u POI)
       ●
```

**Během 3D průletu:**
- Když se cyklista blíží k fotce, miniatura se animovaně zvětší (pulse efekt)
- Po přiblížení se otevře PhotoViewModal jako dosud

### Technické změny

**Soubor: `src/components/TrailMap.tsx`**

1. **Změna foto markerů** (řádky 270-282): Nahradit modré kolečko HTML elementem s `<img>` thumbnailem uvnitř kruhu. Přidat CSS pro hover scale, bílý border, stín a malou tyčku pod fotkou.

2. **Přidat pulse animaci** při blížení cyklisty: Když je `flyingIndex` blízko fotky, přidat CSS třídu `animate-pulse` na příslušný marker.

Žádné nové soubory, žádné API změny - jen vizuální vylepšení existujících markerů.

