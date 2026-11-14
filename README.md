# OVERRIDLE

Daily procedural security terminal web game: **5 modules, 60.0 seconds, 3 shared lives**.

Live: https://overridle.trifase.online

## Mechanics

- **Daily Seed (`YYYYMMDD`)**: Deterministic client-side generation via `mulberry32` PRNG (`seed + roundIndex * 9973` per module). Same 5 modules and parameters for everyone on the same day.
- **60.0s Timer & 3 Shared Lives (`❤️❤️❤️`)**: Any mistake triggers a full-screen red flash, Web Audio synthesized buzzer, and `-1` life. Reaching `0.0s` or `0` lives triggers immediate `INCENERITO` gameover.
- **Mobile-first, zero backend**: Pure static HTML/CSS/ES Modules (`touch-action: manipulation`, no system keyboard required).
- **Daily Persistence & Share**: Saves daily result in `localStorage` (`override30_YYYYMMDD`), unlocks Practice mode afterwards, and copies compact Telegram-ready share text with elapsed time (or `💥`), remaining lives, and `https://overridle.trifase.online`.
- **Practice Mode Selector**: Pick any single module (`1` or `5` rounds) or launch a `5`-module random mix directly from standby or end screen.
- **Pause & Instructions Overlay**: `[⏸ PAUSA]` (or `P` / `Esc`) freezes the timer and animated modules while hiding the puzzle board and keeping module instructions visible.

## Procedural Module Pool (15 Modules)

1. `wires` — Taglia i Cavi (4–5 colored/numbered wires with unambiguous seed rule)
2. `binary_switches` — Switch Binari (6 switches `32|16|8|4|2|1`, target `10..63`)
3. `math_order` — Ordine di Scarica (5 expressions with distinct integer results in ascending/descending order)
4. `fallout_hack` — Terminale Fallout (find 5 target tokens in hex dump without hitting decoys)
5. `memory_flash` — Keycard Flash (1.5s flash of 4 cells on a `3×3` grid)
6. `glyph_rules` — Griglia Geroglifici (`3×3` symbol grid with deterministic conditional rules)
7. `freq_align` — Allinea Frequenza (oscilloscope target alignment held for `0.35s`)
8. `pressure_purge` — Spurgo Pressione (hold & release inside sinusoidal green zone)
9. `rotor_lock` — Aggancio Rotore (2 sequential pin locks inside moving green arc)
10. `valve_sequence` — Bypass Valvole (tap the 3 critical valves `>= 75%` in exact arrival order)
11. `tactical_map` — Mappa Tattica (`5×5` coordinate grid with standard, scrambled, and symbol axes)
12. `magnetic_scale` — Bilancia Magnetica (pick 2 weights to add or remove to match target weight)
13. `stroop_override` — Paradosso Cromatico (3 Stroop prompts by written word or ink color)
14. `signal_tuner` — Decodifica Impulsi (match direct or inverted `• / ━━` patterns to channel table)
15. `reactor_balance` — Bilanciamento Nocciolo (set 3 reactor bars `1..5 MW` matching sum & constraint)

## Run Locally

```bash
python -m http.server 8090
```

Open `http://127.0.0.1:8090/`. Optional query parameters:
- `?seed=YYYYMMDD` — test a specific deterministic daily seed.
- `?test=1` (or `?debug=1`, `?fresh=1`) — bypass reading/writing `localStorage` daily lock for repeatable testing.
- `?reset=1` — clear today's `localStorage` daily lock on load and run in test bypass mode.

## Docker

```bash
docker compose up -d --build
```

Serves static files on port `8060` via `nginx:alpine`.
