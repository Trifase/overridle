# OVERRIDE-30 (OVERRIDLE)

Daily procedural security terminal web game: **5 modules, 30.0 seconds, 3 shared lives**.

Live: https://override.trifase.online

## Mechanics

- **Daily Seed (`YYYYMMDD`)**: Deterministic client-side generation via `mulberry32` PRNG (`seed + roundIndex * 9973` per module). Same 5 modules and parameters for everyone on the same day.
- **30.0s Timer & 3 Shared Lives (`❤️❤️❤️`)**: Any mistake triggers a full-screen red flash, Web Audio synthesized buzzer, and `-1` life. Reaching `0.0s` or `0` lives triggers immediate `INCENERITO` gameover.
- **Mobile-first, zero backend**: Pure static HTML/CSS/ES Modules (`touch-action: manipulation`, no system keyboard required).
- **Daily Persistence & Share**: Saves daily result in `localStorage` (`override30_YYYYMMDD`), unlocks Practice mode afterwards, and copies compact Telegram-ready share text with elapsed time (or `💥`) and remaining lives.

## Procedural Module Pool (10 Modules)

1. `wires` — Taglia i Cavi (4–5 colored/numbered wires with unambiguous seed rule)
2. `binary_switches` — Switch Binari (6 switches `32|16|8|4|2|1`, target `10..63`)
3. `math_order` — Ordine di Scarica (5 expressions with distinct integer results in ascending/descending order)
4. `fallout_hack` — Terminale Fallout (find 5 target tokens in hex dump without hitting decoys)
5. `memory_flash` — Keycard Flash (1.2s flash of 4 cells on a `3×3` grid)
6. `glyph_rules` — Griglia Geroglifici (`3×3` symbol grid with deterministic conditional rules)
7. `freq_align` — Allinea Frequenza (oscilloscope target alignment held for `0.35s`)
8. `pressure_purge` — Spurgo Pressione (hold & release inside sinusoidal green zone)
9. `rotor_lock` — Aggancio Rotore (2 sequential pin locks inside moving green arc)
10. `valve_sequence` — Bypass Valvole (tap the 3 critical valves `>= 75%` in exact arrival order)

## Run Locally

```bash
python -m http.server 8090
```

Open `http://127.0.0.1:8090/` (or append `?seed=20261114` to test a specific seed).

## Docker

```bash
docker compose up -d --build
```

Serves static files on port `8060` via `nginx:alpine`.
