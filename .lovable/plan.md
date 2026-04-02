

## Přidání názvů kopců a měst podél trasy

Využiji Overpass API (OpenStreetMap) k automatickému stažení vrcholů a obcí v okolí trasy a zobrazím je jako markery na mapě.

### Jak to bude fungovat

1. Po načtení GPX souboru se z bounds trasy odešle dotaz na Overpass API
2. Stáhnou se vrcholy (`natural=peak`) a obce (`place=city/town/village`) v okolí trasy
3. Na mapě se zobrazí jako štítky s ikonou - hory pro vrcholy, kolečko pro obce
4. Každý marker bude mít "tyčku" - vertikální čáru pod názvem pro lepší orientaci

### Technické změny

**Nový soubor `src/utils/overpassApi.ts`:**
- Funkce `fetchPeaksAndPlaces(bounds)` - volá Overpass API
- Dotaz na `natural=peak` (vrcholy s názvem a výškou) a `place=city|town|village` (obce)
- Filtruje jen body do ~2 km od trasy
- Vrací pole `{ name, lat, lon, ele?, type: 'peak' | 'place' }`

**Úprava `src/components/TrailMap.tsx`:**
- Po načtení trasy zavolat `fetchPeaksAndPlaces` s bounds rozšířenými o malý buffer
- Vytvořit HTML markery se stylem "tyčky" - vertikální čára + název nahoře
- Vrcholy: ikona hory + název + nadmořská výška (např. "Říp 456 m")
- Obce: menší popisek s názvem města
- Markery přidat do mapy a uložit do ref pro cleanup

### Vizuální styl markerů

```text
  ┌──────────┐
  │ Říp 456m │  ← název + výška (vrchol)
  └────┬─────┘
       │        ← "tyčka" (vertikální čára)
       │
       ●        ← pozice na mapě
```

Pro obce menší varianta bez tyčky, jen label s názvem.

### Omezení
- Overpass API je veřejné a bezplatné, nepotřebuje API klíč
- Dotaz se odešle jen jednou při načtení trasy
- Limit na max ~50 výsledků aby se mapa nezahltila

