## Proč ti fotka nenaskočila

Aktuální detekce v `usePhotoMarkers.ts` měří vzdálenost **trackeru** (aktuální bod na trase, daný `currentPosition` nebo `flyingIndex`) k fotce a spustí ji, jakmile padne pod práh ze slideru.

Problém má dvě varianty:

1. **Přeskakování bodů v 3D průletu**: `useFlythrough.ts` při default rychlosti 50 dělá krok `Math.max(1, Math.floor(50/10)) = 5`. Tracker tedy přeskakuje po 5 bodech. Pokud je hustota GPX bodů ~30 m, jeden krok = 150 m. Vzdálenost trackeru k fotce v jednom snímku může být 200+ m a v dalším už 100+ m za fotkou — slider 150 m to nikdy nezachytí, protože v žádném okamžiku tracker není < 150 m od fotky.
2. **Fotka mimo trasu**: Pokud souřadnice fotky leží > 150 m od polyline trasy (typicky když ji přidáš klikem na mapu nebo z EXIF mimo přesnou stopu), žádný bod trasy se k ní nedostane blíž než její offset — slider 150 m nestačí.

V tvém případě (přidaná fotka přímo do trasy přes "Přidat fotku" → klik na mapě) je nejpravděpodobnější varianta 1: souřadnice jsou na trase, ale tracker mezi snímky průletu fotku "přeskočí".

## Oprava

### Změna logiky detekce (`src/hooks/usePhotoMarkers.ts`)

Místo "vzdálenost aktuálního bodu trasy od fotky" počítej pro každou fotku **nejbližší bod celé trasy** a porovnej, kde tracker právě je vůči tomu nejbližšímu bodu:

```text
pro každou fotku (která ještě nebyla zobrazena):
  najdi index nejbližšího bodu trasy ke GPS fotky → photoTrackIndex
  najdi minimální vzdálenost fotka↔trasa → photoToTrackDist
  
  pokud photoToTrackDist > slider (fotka je moc daleko od trasy):
    → tato fotka se v této session nepustí (přeskoč úplně, ať neblokuje)
  
  pokud tracker právě prochází tím nejbližším bodem (currentIndex ≈ photoTrackIndex):
    → otevři fotku
```

Konkrétně: cache si `nearestTrackIndex` pro každou fotku (počítá se 1× při změně `gpxData`/`photos`). Pak v detekčním efektu jen porovnej:

```ts
const triggerWindow = Math.max(2, Math.floor(stepSize * 1.5)); // tolerance v krocích
if (Math.abs(currentIndex - photo.nearestTrackIndex) <= triggerWindow) {
  trigger(photo);
}
```

Tohle eliminuje problém s přeskakováním bodů během průletu — i kdyby tracker mezi snímky přeskočil 5 bodů, kontrola na "dostal jsem se k indexu nejbližšímu fotce" projde.

Slider "Vzdálenost spuštění" se použije jako **maximální offset fotky od trasy** (pokud je fotka dál než slider, vůbec se nezařadí do session). Tím slider získá smysluplný význam i při přeskakujícím trackeru.

### Vizuální zpětná vazba (`src/hooks/usePhotoMarkers.ts`)

Když se při loadu trasy zjistí, že některá fotka leží dál od trasy, než dovoluje slider, ukaž `toast.warning`:

```text
"Fotka 'IMG_1234' je 230 m od trasy — zvyš slider 'Vzdálenost spuštění' nad 230 m, aby se zobrazila."
```

Uživatel okamžitě ví, co s tím (žádné tiché selhání).

### Drobnost: rozšířit horní hranici slideru (`src/components/AnimationControls.tsx`)

Aktuálně `max=200`. Pokud někdo má fotku 250 m od trasy (například výhled na hrad), nemá jak ji povolit. Změna na `max=500, step=10`.

## Co se nemění

- Fullscreen modal s Ken Burns + 4s autoclose timer.
- Sjednocená detekce pro live i 3D průlet (jen mění se, *jak* se porovnává).
- `defaultAnimationSettings.threshold` zůstává 0.00045 (~50 m), což je dobrá výchozí přísnost.

## Soubory k úpravě

- `src/hooks/usePhotoMarkers.ts` — přepočet detekce na "tracker dorazil k bodu nejbližšímu fotce" + warning toast pro fotky mimo dosah.
- `src/components/AnimationControls.tsx` — rozsah slideru 10–500 m.
- `mem://features/animace-fotek` — aktualizovat pravidlo pro detekci.
