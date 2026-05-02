## Cíl

Aby se průlet zpomaloval ve stoupání / na pomalých úsecích a zrychloval při sjezdech / rovinkách — věrně podle reálné rychlosti zaznamenané v GPX (timestamps mezi body).

## Jak to bude fungovat

1. **Detekce dat**: Při načtení GPX zjistíme, jestli body obsahují `time`. Pokud ano, spočítáme reálnou rychlost (m/s) mezi sousedními body.
2. **Nový režim "Dynamická rychlost"**: V panelu ovládání průletu přibude **přepínač (Switch)** „Dynamická rychlost podle GPX". Pokud GPX časy neobsahuje, přepínač bude disabled s popiskem „GPX neobsahuje časové značky".
3. **Slider „Rychlost" se změní na násobič** (0.25× – 4×, default 1×) — určuje, jak moc zrychlit/zpomalit oproti reálnému tempu (např. 2× = dvakrát rychlejší než reálná jízda).
4. **Animace průletu**: Místo konstantního `step` a `duration` se pro každý úsek mezi body spočítá délka kroku v ms z reálného času:
   ```
   realDtMs = (time[i+1] - time[i])
   stepDuration = realDtMs / multiplier
   ```
   Krok zůstává `step = 1` (přechod mezi sousedními body), aby zachytil mikro-změny tempa.
5. **Ochrany**: 
   - Minimální `stepDuration` 16 ms (cap nahoře, aby UI neumřelo).
   - Maximální `stepDuration` ~2000 ms (bod s extrémní pauzou se přeskočí plynule).
   - Pokud je v GPX dlouhá pauza (stání), volitelně ji zkrátit na max 1 s reálného času.

## Technické změny

**`src/hooks/useFlythrough.ts`**
- Přidat state `dynamicSpeed: boolean` (default `false`) a setter.
- `flySpeed` reinterpretovat jako násobič (1–400 → 0.01×–4×) jen v dynamickém režimu; v normálním režimu zůstává původní logika.
- V `animateStep`: pokud `dynamicSpeed && currentPoint.time && nextPoint.time`, spočítat `duration` z reálných timestampů a násobiče. Jinak fallback na původní vzorec.
- Přepočet `flyDurationSec`: v dynamickém režimu = (totalRealDuration / multiplier).
- Při startu průletu zjistit, zda track má `time` – pokud ne, automaticky vypnout `dynamicSpeed`.

**`src/components/TrailMap.tsx`**
- V panelu nad sliderem „Rychlost" přidat `Switch` s popiskem „Dynamická rychlost (dle GPX)".
- Detekce dostupnosti: `hasTimeData = gpxData?.tracks[0]?.points.some(p => p.time)`.
- Pokud `hasTimeData === false`, switch disabled + tooltip.
- Label slideru přepínat mezi „Rychlost" (statický) a „Násobič" (dynamický), zobrazit `1.0×` místo `82%`.

**`src/types/gpx.ts`** — beze změny (`time` už je).

## UX poznámka

V dynamickém režimu uvidíš v průletu reálný rytmus — zpomalí to v kopci, zrychlí na sjezdu. Násobič 1× = reálný čas trasy, 4× = čtyřikrát rychlejší.
