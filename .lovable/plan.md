# Náhled pro sdílení na Facebooku

Aby tvoje stránka `gpx-trail-flyer.vercel.app` měla na FB / Twitteru / Messengeru hezký velký náhled s obrázkem a popisem (místo holého URL).

## Co se udělá

### 1. Náhledový obrázek (1200×630)
Už je vygenerovaný a uložený jako `public/og-image.jpg` — tmavé pozadí s horami, slunce, oranžová svítící GPX trasa, zelený start / červený cíl, velký nápis **"GPX Trail Flyer"** a podtitul **"Z tvé GPS trasy 3D průlet"** + URL.

```text
┌──────────────────────────────────────────┐
│ GPX TRAIL FLYER              ☀          │
│ Z tvé GPS trasy 3D průlet               │
│                                          │
│        ▲▲▲   ▲▲   ▲▲▲▲   ▲▲             │
│      ▲▲  ▲▲▲  ▲▲▲▲  ▲▲▲▲  ▲▲▲           │
│   ●━━╱╲━━╱╲━━╱╲━━╱╲━━╱╲━━●              │
│ gpx-trail-flyer.vercel.app              │
└──────────────────────────────────────────┘
```

### 2. Aktualizace `index.html`
Nahradí současné generické Lovable meta tagy za:

- `<title>` a `<meta description>` v češtině
- `og:title`, `og:description`, `og:url`, `og:image` (s rozměry 1200×630)
- `og:locale = cs_CZ`
- Twitter card (`summary_large_image`)
- `<html lang="cs">`

## Po nasazení

1. Po publishi otevři **Facebook Sharing Debugger** (https://developers.facebook.com/tools/debug/) a zadej `https://gpx-trail-flyer.vercel.app/` → klikni „Scrape Again". Tím se FB cache obnoví a uvidíš nový náhled hned.
2. Stejné pro Twitter: https://cards-dev.twitter.com/validator
3. Pokud sdílíš konkrétní trasu (`/trail/...`), náhled bude zatím stejný pro celý web. Per-trasa náhledy by vyžadovaly server-side rendering nebo edge funkci — to bych dělal samostatně.

## Soubory
- `public/og-image.jpg` (nový, ~70 kB)
- `index.html` (upravené meta tagy)
