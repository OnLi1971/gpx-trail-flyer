## Problém

Po předchozí změně na Haversine detekci jsem do `usePhotoMarkers.ts` vložil tvrdý strop **30 m** na rádius příchodu k fotce:

```ts
return Math.min(40, fromDeg, 30); // vždy ≤ 30 m
```

To znamená, že **ať nastavíš slider „Vzdálenost spuštění" na cokoli mezi 100–500 m, reálně se používá pořád 30 m**. Pokud GPX trasa neprochází přesně do 30 m od fotky (typicky nepřesnost EXIF + odchylka trasy), fotka se nikdy nespustí. Proto se ti dvě nově přidané fotky neukázaly.

Slider v UI navíc začíná na 20 m a jde do 500 m, což je matoucí — uživatel mění hodnotu, ale nic se neděje.

## Oprava

**`src/hooks/usePhotoMarkers.ts`**
- Zrušit hard cap. Rádius = přímo hodnota ze slideru (v metrech), s jemným spodním limitem 10 m, aby šlo ručně zacílit a horním 500 m, aby nepřišly všechny najednou.

```ts
const arrivalRadiusMeters = useCallback(() => {
  const meters = animationSettings.threshold * 111000; // deg → m
  return Math.min(500, Math.max(10, meters));
}, [animationSettings.threshold]);
```

**`src/types/gpx.ts`**
- Změnit default `threshold` z `0.005` (≈555 m, mimo nový cap) na `0.00045` (≈50 m) — rozumný default pro běžné cyklo trasy s mírnou nepřesností EXIF.

**`src/components/AnimationControls.tsx`**
- Slider rozsah `min=10`, `max=200`, `step=5`. Nad 200 m už fotky vyskakují příliš dřív — pokud někdo opravdu chce 500 m, slider zatím povolí jen 200 (čistší UX). Pokud bys chtěl širší rozsah, snadno se vrátí.

## Co tím získáš

- Slider „Vzdálenost spuštění" reálně funguje — když ho posuneš výš, fotky se spustí dříve.
- Default 50 m: tracker je u fotky, ale není to tak přísné jako 30 m, takže se neminou kvůli GPS nepřesnosti.
- Pokud budou fotky pořád unikat (např. tvoje EXIF souřadnice jsou daleko od trasy), zvýšíš slider na 100–200 m.

## Co se nemění

- Fullscreen modal s Ken Burns efektem zůstává.
- 4s autoclose timer zůstává.
- Detekce funguje pro live i 3D průlet stejně.
