# Více tras v jednom průletu (dovolená)

Možnost nahrát několik GPX souborů najednou a přehrát je jako jeden souvislý film — trasa po trase, každá jinou barvou, už odlétané trasy zůstávají vykreslené na mapě.

## Jak to bude fungovat

1. **Nahrání více souborů** — dropzone přijme více GPX najednou (nebo je lze přidávat postupně). Vznikne seznam „etap".
2. **Seznam etap** — karta se seznamem tras: název, délka, barva (auto-přiřazená z palety, ručně změnitelná), přetažením lze změnit pořadí, křížkem smazat.
3. **Přehrávání** — spustí se průlet nad etapou 1. Po jejím dokončení kamera **nepřelétá** na start další etapy: místo toho se u přechodu drží orbitální pohled (kamera krouží dokola) a pak plynule začne etapa 2. Nakreslená trasa předchozích etap na mapě zůstává ve své barvě.
4. **Závěr** — po poslední etapě se spustí stávající outro (oddálení, vykreslení všech tras, rotace, popisky start/cíl, souhrnná karta) nad celou dovolenou.
5. **Ostatní funkce** — ořez (Od–Do km), fotky, POI a statistiky se vážou k aktuálně vybrané etapě; souhrnná karta ukazuje součet za všechny etapy.
6. **Uložení a sdílení** — vícetrasový „výlet" se uloží do účtu a jde sdílet odkazem stejně jako dnes jedna trasa.

## Technické provedení

- **DB**: nová tabulka `public.trips` (id, user_id, name, slug, is_public, created_at/updated_at) + sloupce na `trails`: `trip_id uuid references trips(id) on delete cascade`, `order_index int`, `color text`. GRANTy + RLS podle vzoru `trails` (owner CRUD, anon SELECT u veřejných). Jedna trasa bez `trip_id` funguje dál jako dnes.
- **Stav**: `src/pages/Index.tsx` přejde z `originalGpxData` na `stages: Stage[]` (`{ id, gpx, filename, color, trimFrom, trimTo }`) s indexem `activeStage`. Jedna nahraná trasa = pole s jednou položkou, takže se nic nerozbije.
- **Mapa**: `TrailMap.tsx` dostane prop `stages` místo jedné `gpxData`. Per-etapa se vytvoří vlastní source/layer (`trail-line-<i>`, `trail-active-<i>`) s vlastní barvou; už dokončené etapy zůstanou vykreslené v plné barvě.
- **Průlet**: `useFlythrough.ts` dostane frontu etap. Po dokončení etapy se přepne do krátké orbitální fáze (rotace bearingu kolem koncového bodu, existující rAF rotační logika z outra) a pak se resetuje progress a spustí další etapa. Délka orbitu bude nastavitelný slider „Přechod mezi trasami" (0–8 s).
- **Barvy**: paleta 8 barev navázaná na design tokeny; přiřazení podle pořadí, ruční override v seznamu etap.
- **Nahrávání videa**: beze změny — nahrává se celý řetěz etap v jednom záznamu.
- **Uložení/sdílení**: `SaveTrailDialog` uloží `trip` + N řádků `trails`; `SharedTrail.tsx` načte všechny trasy tripu podle `order_index` a předá je do `TrailMap` jako `stages`. `MyTrails` zobrazí výlety s počtem etap.
