#!/usr/bin/env python3
"""Overridle telemetry collector API and 16-bit analytics dashboard server."""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("PORT", "80"))
DB_PATH = Path(os.environ.get("DB_PATH", "/data/telemetry.db"))
BASE_DIR = Path(__file__).resolve().parent
DASHBOARD_PATH = BASE_DIR / "dashboard.html"

MODULE_CATALOG: dict[str, tuple[str, float]] = {
    "wires": ("TAGLIA I CAVI", 5.5),
    "rotor_lock": ("AGGANCIO ROTORE", 5.5),
    "stroop_override": ("STROOP OVERRIDE", 6.0),
    "signal_tuner": ("PULSE DECODER", 6.0),
    "glyph_rules": ("GRIGLIA GEROGLIFICI", 6.5),
    "tactical_map": ("MAPPA TATTICA", 6.5),
    "binary_switches": ("SWITCH BINARI", 7.0),
    "magnetic_scale": ("BILANCIA MAGNETICA", 7.0),
    "freq_align": ("ALLINEA FREQUENZA", 7.5),
    "math_order": ("ORDINE DI SCARICA", 7.5),
    "fallout_hack": ("TERMINALE FALLOUT", 8.0),
    "reactor_balance": ("CORE BALANCE", 8.0),
    "pressure_purge": ("SPURGO PRESSIONE", 8.0),
    "memory_flash": ("KEYCARD FLASH", 8.5),
    "valve_sequence": ("RESET VALVOLE", 9.0),
}

SOURCE_ALIASES = {
    "l.instagram.com": "Instagram",
    "instagram.com": "Instagram",
    "t.co": "X / Twitter",
    "x.com": "X / Twitter",
    "twitter.com": "X / Twitter",
    "reddit.com": "Reddit",
    "old.reddit.com": "Reddit",
    "out.reddit.com": "Reddit",
    "web.whatsapp.com": "WhatsApp",
    "wa.me": "WhatsApp",
    "l.wl.co": "WhatsApp",
    "t.me": "Telegram",
    "web.telegram.org": "Telegram",
    "discord.com": "Discord",
    "discordapp.com": "Discord",
    "l.facebook.com": "Facebook",
    "m.facebook.com": "Facebook",
    "facebook.com": "Facebook",
    "threads.net": "Threads",
    "news.ycombinator.com": "Hacker News",
    "github.com": "GitHub",
    "linkedin.com": "LinkedIn",
    "lnkd.in": "LinkedIn",
}

SELF_HOSTS = {
    "",
    "overridle.com",
    "www.overridle.com",
    "trifase.github.io",
    "overridle.trifase.online",
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def clean_str(val: Any, max_len: int = 128, default: str = "") -> str:
    if val is None:
        return default
    text = str(val).strip()
    return text[:max_len] if text else default


def clean_int(val: Any, default: int = 0, min_val: int = 0, max_val: int = 10_000_000) -> int:
    try:
        num = int(round(float(val)))
        return max(min_val, min(max_val, num))
    except (TypeError, ValueError):
        return default


def normalize_source(referrer: str, utm_source: str) -> tuple[str, str]:
    utm = clean_str(utm_source, 64)
    ref_host = ""
    if referrer:
        try:
            parsed = urlparse(referrer if "://" in referrer else f"https://{referrer}")
            ref_host = (parsed.hostname or "").lower()
            if ref_host.startswith("www."):
                ref_host = ref_host[4:]
        except ValueError:
            ref_host = ""

    if utm:
        return f"utm:{utm}", ref_host or "utm"
    if ref_host in SELF_HOSTS:
        return "Direct / Bookmark", ""
    if ref_host in SOURCE_ALIASES:
        return SOURCE_ALIASES[ref_host], ref_host
    if "google." in ref_host:
        return "Google", ref_host
    if "bing." in ref_host:
        return "Bing", ref_host
    if "duckduckgo." in ref_host:
        return "DuckDuckGo", ref_host
    return ref_host or "Direct / Bookmark", ref_host


@contextmanager
def get_conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=15.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        with conn:
            yield conn
    finally:
        conn.close()


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                sid TEXT NOT NULL,
                vid TEXT NOT NULL,
                is_returning INTEGER NOT NULL DEFAULT 0,
                country TEXT NOT NULL DEFAULT 'XX',
                source TEXT NOT NULL DEFAULT 'Direct / Bookmark',
                referrer_host TEXT NOT NULL DEFAULT '',
                referrer_raw TEXT NOT NULL DEFAULT '',
                lang TEXT NOT NULL DEFAULT 'en',
                mobile INTEGER NOT NULL DEFAULT 0,
                vw INTEGER NOT NULL DEFAULT 0,
                vh INTEGER NOT NULL DEFAULT 0,
                seed INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_ts ON sessions(ts);
            CREATE INDEX IF NOT EXISTS idx_sessions_vid ON sessions(vid);
            CREATE INDEX IF NOT EXISTS idx_sessions_sid ON sessions(sid);

            CREATE TABLE IF NOT EXISTS runs (
                run_id TEXT PRIMARY KEY,
                ts TEXT NOT NULL,
                ended_ts TEXT,
                vid TEXT NOT NULL,
                sid TEXT NOT NULL,
                mode TEXT NOT NULL,
                seed INTEGER NOT NULL DEFAULT 0,
                time_limit_ms INTEGER NOT NULL DEFAULT 0,
                elapsed_ms INTEGER NOT NULL DEFAULT 0,
                autopause INTEGER NOT NULL DEFAULT 1,
                outcome TEXT NOT NULL DEFAULT 'started',
                lives_left INTEGER NOT NULL DEFAULT 3,
                failed_module_id TEXT,
                failed_variant TEXT,
                modules_json TEXT NOT NULL DEFAULT '[]',
                country TEXT NOT NULL DEFAULT 'XX'
            );
            CREATE INDEX IF NOT EXISTS idx_runs_ts ON runs(ts);
            CREATE INDEX IF NOT EXISTS idx_runs_mode ON runs(mode);

            CREATE TABLE IF NOT EXISTS rounds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                run_id TEXT NOT NULL,
                vid TEXT NOT NULL,
                mode TEXT NOT NULL,
                round_index INTEGER NOT NULL DEFAULT 1,
                module_id TEXT NOT NULL,
                variant TEXT NOT NULL DEFAULT 'classic',
                outcome TEXT NOT NULL,
                duration_ms INTEGER NOT NULL DEFAULT 0,
                budget_ms INTEGER NOT NULL DEFAULT 0,
                mistakes INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_rounds_ts ON rounds(ts);
            CREATE INDEX IF NOT EXISTS idx_rounds_mod ON rounds(module_id, variant);
            CREATE INDEX IF NOT EXISTS idx_rounds_run ON rounds(run_id);

            CREATE TABLE IF NOT EXISTS shares (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                vid TEXT NOT NULL,
                sid TEXT NOT NULL,
                run_id TEXT,
                mode TEXT NOT NULL DEFAULT 'daily',
                screen TEXT NOT NULL DEFAULT 'end',
                country TEXT NOT NULL DEFAULT 'XX'
            );
            CREATE INDEX IF NOT EXISTS idx_shares_ts ON shares(ts);
            """
        )


def record_event(payload: dict[str, Any], country: str) -> None:
    ev_type = clean_str(payload.get("type"), 32)
    vid = clean_str(payload.get("vid"), 64, "anon")
    sid = clean_str(payload.get("sid"), 64, "anon")
    now_iso = utc_now_iso()

    with get_conn() as conn:
        if ev_type == "session_start":
            referrer = clean_str(payload.get("referrer"), 512)
            utm_source = clean_str(payload.get("utm_source"), 64)
            source, ref_host = normalize_source(referrer, utm_source)
            # Avoid duplicate session row for the exact same tab session ID
            existing = conn.execute("SELECT 1 FROM sessions WHERE sid = ? LIMIT 1", (sid,)).fetchone()
            if not existing:
                conn.execute(
                    """
                    INSERT INTO sessions (
                        ts, sid, vid, is_returning, country, source,
                        referrer_host, referrer_raw, lang, mobile, vw, vh, seed
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        now_iso,
                        sid,
                        vid,
                        1 if payload.get("returning") else 0,
                        country,
                        source,
                        ref_host,
                        referrer,
                        clean_str(payload.get("lang"), 8, "en"),
                        1 if payload.get("mobile") else 0,
                        clean_int(payload.get("vw"), 0, 0, 10000),
                        clean_int(payload.get("vh"), 0, 0, 10000),
                        clean_int(payload.get("seed"), 0, 0, 99999999),
                    ),
                )

        elif ev_type == "run_start":
            run_id = clean_str(payload.get("run_id"), 64)
            if not run_id:
                return
            modules = payload.get("modules")
            modules_json = json.dumps(modules[:10] if isinstance(modules, list) else [])
            conn.execute(
                """
                INSERT OR IGNORE INTO runs (
                    run_id, ts, vid, sid, mode, seed, time_limit_ms,
                    autopause, outcome, modules_json, country
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'started', ?, ?)
                """,
                (
                    run_id,
                    now_iso,
                    vid,
                    sid,
                    clean_str(payload.get("mode"), 32, "daily"),
                    clean_int(payload.get("seed"), 0, 0, 99999999),
                    clean_int(payload.get("time_limit_ms"), 0, 0, 3600000),
                    1 if payload.get("autopause") else 0,
                    modules_json,
                    country,
                ),
            )

        elif ev_type == "round_end":
            run_id = clean_str(payload.get("run_id"), 64)
            module_id = clean_str(payload.get("module_id"), 48)
            if not run_id or not module_id:
                return
            conn.execute(
                """
                INSERT INTO rounds (
                    ts, run_id, vid, mode, round_index, module_id,
                    variant, outcome, duration_ms, budget_ms, mistakes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    now_iso,
                    run_id,
                    vid,
                    clean_str(payload.get("mode"), 32, "daily"),
                    clean_int(payload.get("round_index"), 1, 1, 10),
                    module_id,
                    clean_str(payload.get("variant"), 32, "classic"),
                    clean_str(payload.get("outcome"), 24, "win"),
                    clean_int(payload.get("duration_ms"), 0, 0, 600000),
                    clean_int(payload.get("budget_ms"), 0, 0, 600000),
                    clean_int(payload.get("mistakes"), 0, 0, 100),
                ),
            )

        elif ev_type == "run_end":
            run_id = clean_str(payload.get("run_id"), 64)
            if not run_id:
                return
            outcome = clean_str(payload.get("outcome"), 24, "lose")
            elapsed_ms = clean_int(payload.get("elapsed_ms"), 0, 0, 3600000)
            time_limit_ms = clean_int(payload.get("time_limit_ms"), 0, 0, 3600000)
            lives_left = clean_int(payload.get("lives_left"), 0, 0, 10)
            failed_mod = clean_str(payload.get("failed_module_id"), 48) or None
            failed_var = clean_str(payload.get("failed_variant"), 32) or None

            cur = conn.execute(
                """
                UPDATE runs
                SET ended_ts = ?, outcome = ?, elapsed_ms = ?, lives_left = ?,
                    failed_module_id = ?, failed_variant = ?
                WHERE run_id = ?
                """,
                (now_iso, outcome, elapsed_ms, lives_left, failed_mod, failed_var, run_id),
            )
            if cur.rowcount == 0:
                conn.execute(
                    """
                    INSERT INTO runs (
                        run_id, ts, ended_ts, vid, sid, mode, seed, time_limit_ms,
                        elapsed_ms, outcome, lives_left, failed_module_id, failed_variant, country
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        run_id,
                        now_iso,
                        now_iso,
                        vid,
                        sid,
                        clean_str(payload.get("mode"), 32, "daily"),
                        clean_int(payload.get("seed"), 0, 0, 99999999),
                        time_limit_ms,
                        elapsed_ms,
                        outcome,
                        lives_left,
                        failed_mod,
                        failed_var,
                        country,
                    ),
                )

        elif ev_type == "share_click":
            conn.execute(
                """
                INSERT INTO shares (ts, vid, sid, run_id, mode, screen, country)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    now_iso,
                    vid,
                    sid,
                    clean_str(payload.get("run_id"), 64) or None,
                    clean_str(payload.get("mode"), 32, "daily"),
                    clean_str(payload.get("screen"), 24, "end"),
                    country,
                ),
            )


def build_time_filter(period: str, col: str = "ts") -> tuple[str, list[Any]]:
    if period == "today":
        return f"date({col}, 'localtime') = date('now', 'localtime')", []
    if period == "7d":
        return f"datetime({col}) >= datetime('now', '-7 days')", []
    if period == "30d":
        return f"datetime({col}) >= datetime('now', '-30 days')", []
    return "1=1", []


def build_mode_filter(mode_filter: str) -> tuple[str, list[Any]]:
    if mode_filter == "daily":
        return "mode = 'daily'", []
    if mode_filter == "practice":
        return "mode != 'daily'", []
    return "1=1", []


def build_stats(period: str = "30d", mode_filter: str = "all") -> dict[str, Any]:
    sess_where, sess_params = build_time_filter(period, "ts")
    run_time_where, run_time_params = build_time_filter(period, "ts")
    round_time_where, round_time_params = build_time_filter(period, "ts")
    share_time_where, share_time_params = build_time_filter(period, "ts")
    mode_where, mode_params = build_mode_filter(mode_filter)

    with get_conn() as conn:
        sess_row = conn.execute(
            f"""
            SELECT
                COUNT(*) AS total_sessions,
                COUNT(DISTINCT vid) AS unique_visitors,
                SUM(CASE WHEN is_returning = 1 THEN 1 ELSE 0 END) AS returning_sessions,
                SUM(CASE WHEN mobile = 1 THEN 1 ELSE 0 END) AS mobile_sessions
            FROM sessions
            WHERE {sess_where}
            """,
            sess_params,
        ).fetchone()

        run_row = conn.execute(
            f"""
            SELECT
                COUNT(*) AS total_runs,
                SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) AS wins,
                SUM(CASE WHEN outcome = 'no_lives' THEN 1 ELSE 0 END) AS no_lives,
                SUM(CASE WHEN outcome = 'timeout' THEN 1 ELSE 0 END) AS timeouts,
                SUM(CASE WHEN outcome IN ('abandoned', 'started') THEN 1 ELSE 0 END) AS abandoned,
                SUM(CASE WHEN mode = 'daily' THEN 1 ELSE 0 END) AS daily_runs,
                SUM(CASE WHEN mode = 'daily' AND outcome = 'win' THEN 1 ELSE 0 END) AS daily_wins,
                AVG(CASE WHEN outcome = 'win' THEN elapsed_ms END) AS avg_win_ms,
                AVG(CASE WHEN outcome IN ('win', 'no_lives', 'timeout') THEN lives_left END) AS avg_lives_left
            FROM runs
            WHERE {run_time_where} AND {mode_where}
            """,
            run_time_params + mode_params,
        ).fetchone()

        share_row = conn.execute(
            f"SELECT COUNT(*) AS share_clicks FROM shares WHERE {share_time_where} AND {mode_where}",
            share_time_params + mode_params,
        ).fetchone()

        countries = [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT country AS label, COUNT(DISTINCT vid) AS visitors, COUNT(*) AS sessions
                FROM sessions
                WHERE {sess_where}
                GROUP BY country
                ORDER BY visitors DESC, sessions DESC
                LIMIT 15
                """,
                sess_params,
            ).fetchall()
        ]

        referrers = [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT source AS label, COUNT(DISTINCT vid) AS visitors, COUNT(*) AS sessions
                FROM sessions
                WHERE {sess_where}
                GROUP BY source
                ORDER BY sessions DESC, visitors DESC
                LIMIT 15
                """,
                sess_params,
            ).fetchall()
        ]

        languages = [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT UPPER(lang) AS label, COUNT(DISTINCT vid) AS visitors, COUNT(*) AS sessions
                FROM sessions
                WHERE {sess_where}
                GROUP BY UPPER(lang)
                ORDER BY sessions DESC
                """,
                sess_params,
            ).fetchall()
        ]

        # Daily series (visitors + runs + wins grouped by local date)
        series_map: dict[str, dict[str, Any]] = {}
        for r in conn.execute(
            f"""
            SELECT date(ts, 'localtime') AS day, COUNT(DISTINCT vid) AS visitors, COUNT(*) AS sessions
            FROM sessions
            WHERE {sess_where}
            GROUP BY day
            ORDER BY day ASC
            """,
            sess_params,
        ).fetchall():
            series_map[r["day"]] = {
                "day": r["day"],
                "visitors": r["visitors"],
                "sessions": r["sessions"],
                "runs": 0,
                "wins": 0,
            }

        for r in conn.execute(
            f"""
            SELECT date(ts, 'localtime') AS day,
                   COUNT(*) AS runs,
                   SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) AS wins
            FROM runs
            WHERE {run_time_where} AND {mode_where}
            GROUP BY day
            ORDER BY day ASC
            """,
            run_time_params + mode_params,
        ).fetchall():
            entry = series_map.setdefault(
                r["day"], {"day": r["day"], "visitors": 0, "sessions": 0, "runs": 0, "wins": 0}
            )
            entry["runs"] = r["runs"]
            entry["wins"] = r["wins"] or 0

        daily_series = [series_map[k] for k in sorted(series_map.keys())][-30:]

        # Per-module + per-variant balancing stats
        variant_rows = conn.execute(
            f"""
            SELECT
                module_id,
                variant,
                COUNT(*) AS plays,
                SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) AS wins,
                SUM(CASE WHEN outcome = 'no_lives' THEN 1 ELSE 0 END) AS no_lives,
                SUM(CASE WHEN outcome = 'timeout' THEN 1 ELSE 0 END) AS timeouts,
                SUM(CASE WHEN outcome = 'abandoned' THEN 1 ELSE 0 END) AS abandoned,
                SUM(mistakes) AS total_mistakes,
                AVG(mistakes) AS avg_mistakes,
                AVG(CASE WHEN outcome != 'abandoned' THEN duration_ms END) AS avg_duration_ms,
                AVG(NULLIF(budget_ms, 0)) AS avg_budget_ms
            FROM rounds
            WHERE {round_time_where} AND {mode_where}
            GROUP BY module_id, variant
            """,
            round_time_params + mode_params,
        ).fetchall()

        mod_agg: dict[str, dict[str, Any]] = {}
        for mod_id, (title_it, base_s) in MODULE_CATALOG.items():
            mod_agg[mod_id] = {
                "module_id": mod_id,
                "title": title_it,
                "base_budget_ms": int(base_s * 1000),
                "plays": 0,
                "wins": 0,
                "no_lives": 0,
                "timeouts": 0,
                "abandoned": 0,
                "total_mistakes": 0,
                "duration_sum_ms": 0.0,
                "duration_count": 0,
                "budget_sum_ms": 0.0,
                "budget_count": 0,
                "variants": [],
            }

        for r in variant_rows:
            mod_id = r["module_id"]
            if mod_id not in mod_agg:
                mod_agg[mod_id] = {
                    "module_id": mod_id,
                    "title": mod_id.upper(),
                    "base_budget_ms": 7000,
                    "plays": 0,
                    "wins": 0,
                    "no_lives": 0,
                    "timeouts": 0,
                    "abandoned": 0,
                    "total_mistakes": 0,
                    "duration_sum_ms": 0.0,
                    "duration_count": 0,
                    "budget_sum_ms": 0.0,
                    "budget_count": 0,
                    "variants": [],
                }
            m = mod_agg[mod_id]
            plays = r["plays"] or 0
            wins = r["wins"] or 0
            no_lives = r["no_lives"] or 0
            timeouts = r["timeouts"] or 0
            abandoned = r["abandoned"] or 0
            mistakes = r["total_mistakes"] or 0
            finished = max(0, plays - abandoned)
            avg_dur = r["avg_duration_ms"] or 0.0
            avg_bud = r["avg_budget_ms"] or m["base_budget_ms"]

            m["plays"] += plays
            m["wins"] += wins
            m["no_lives"] += no_lives
            m["timeouts"] += timeouts
            m["abandoned"] += abandoned
            m["total_mistakes"] += mistakes
            if finished > 0 and r["avg_duration_ms"] is not None:
                m["duration_sum_ms"] += avg_dur * finished
                m["duration_count"] += finished
            if plays > 0:
                m["budget_sum_ms"] += avg_bud * plays
                m["budget_count"] += plays

            m["variants"].append(
                {
                    "variant": r["variant"] or "classic",
                    "plays": plays,
                    "wins": wins,
                    "win_rate": round((wins / finished) * 100, 1) if finished else 0.0,
                    "total_mistakes": mistakes,
                    "avg_mistakes": round(mistakes / plays, 2) if plays else 0.0,
                    "timeouts": timeouts,
                    "timeout_rate": round((timeouts / finished) * 100, 1) if finished else 0.0,
                    "avg_duration_ms": round(avg_dur),
                    "budget_ms": round(avg_bud),
                }
            )

        modules_out = []
        for m in mod_agg.values():
            plays = m["plays"]
            finished = max(0, plays - m["abandoned"])
            avg_dur_ms = round(m["duration_sum_ms"] / m["duration_count"]) if m["duration_count"] else 0
            avg_budget_ms = round(m["budget_sum_ms"] / m["budget_count"]) if m["budget_count"] else m["base_budget_ms"]
            win_rate = round((m["wins"] / finished) * 100, 1) if finished else 0.0
            timeout_rate = round((m["timeouts"] / finished) * 100, 1) if finished else 0.0
            avg_mistakes = round(m["total_mistakes"] / plays, 2) if plays else 0.0

            m["variants"].sort(key=lambda v: (-v["plays"], v["variant"]))
            modules_out.append(
                {
                    "module_id": m["module_id"],
                    "title": m["title"],
                    "plays": plays,
                    "finished": finished,
                    "wins": m["wins"],
                    "win_rate": win_rate,
                    "no_lives": m["no_lives"],
                    "timeouts": m["timeouts"],
                    "timeout_rate": timeout_rate,
                    "total_mistakes": m["total_mistakes"],
                    "avg_mistakes": avg_mistakes,
                    "avg_duration_ms": avg_dur_ms,
                    "budget_ms": avg_budget_ms,
                    "variants": m["variants"],
                }
            )

        # Sort hardest/most played first (by avg_mistakes desc, then plays desc)
        modules_out.sort(key=lambda x: (-x["avg_mistakes"], -x["plays"], x["title"]))

        recent_runs = [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT ts, mode, seed, outcome, elapsed_ms, time_limit_ms,
                       lives_left, failed_module_id, failed_variant, country
                FROM runs
                WHERE {run_time_where} AND {mode_where}
                ORDER BY ts DESC
                LIMIT 25
                """,
                run_time_params + mode_params,
            ).fetchall()
        ]

    total_sess = sess_row["total_sessions"] or 0
    unique_vis = sess_row["unique_visitors"] or 0
    ret_sess = sess_row["returning_sessions"] or 0
    mob_sess = sess_row["mobile_sessions"] or 0

    total_runs = run_row["total_runs"] or 0
    wins = run_row["wins"] or 0
    no_lives = run_row["no_lives"] or 0
    timeouts = run_row["timeouts"] or 0
    abandoned = run_row["abandoned"] or 0
    finished_runs = wins + no_lives + timeouts
    daily_runs = run_row["daily_runs"] or 0
    daily_wins = run_row["daily_wins"] or 0
    share_clicks = share_row["share_clicks"] or 0

    return {
        "generated_at": utc_now_iso(),
        "period": period,
        "mode": mode_filter,
        "overview": {
            "unique_visitors": unique_vis,
            "total_sessions": total_sess,
            "returning_pct": round((ret_sess / total_sess) * 100, 1) if total_sess else 0.0,
            "mobile_pct": round((mob_sess / total_sess) * 100, 1) if total_sess else 0.0,
            "total_runs": total_runs,
            "finished_runs": finished_runs,
            "abandoned_runs": abandoned,
            "wins": wins,
            "no_lives": no_lives,
            "timeouts": timeouts,
            "win_rate": round((wins / finished_runs) * 100, 1) if finished_runs else 0.0,
            "daily_runs": daily_runs,
            "daily_win_rate": round((daily_wins / daily_runs) * 100, 1) if daily_runs else 0.0,
            "avg_win_ms": round(run_row["avg_win_ms"] or 0),
            "avg_lives_left": round(run_row["avg_lives_left"] or 0.0, 2),
            "share_clicks": share_clicks,
            "share_rate": round((share_clicks / finished_runs) * 100, 1) if finished_runs else 0.0,
        },
        "countries": countries,
        "referrers": referrers,
        "languages": languages,
        "daily_series": daily_series,
        "modules": modules_out,
        "recent_runs": recent_runs,
    }


class TelemetryHandler(BaseHTTPRequestHandler):
    server_version = "OverridleTelemetry/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        # Keep container logs quiet for health/poll noise unless error
        return

    def _send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")

    def _send_json(self, status: int, data: Any, cors: bool = False) -> None:
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        if cors:
            self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/health":
            self._send_json(HTTPStatus.OK, {"status": "ok"})
            return

        if path == "/api/stats":
            qs = parse_qs(parsed.query)
            period = (qs.get("period") or ["30d"])[0]
            if period not in {"today", "7d", "30d", "all"}:
                period = "30d"
            mode_filter = (qs.get("mode") or ["all"])[0]
            if mode_filter not in {"all", "daily", "practice"}:
                mode_filter = "all"
            self._send_json(HTTPStatus.OK, build_stats(period, mode_filter))
            return

        if path in {"/", "/index.html"}:
            if not DASHBOARD_PATH.exists():
                self.send_error(HTTPStatus.NOT_FOUND, "Dashboard missing")
                return
            html = DASHBOARD_PATH.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(html)))
            self.end_headers()
            self.wfile.write(html)
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not Found")

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/event":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"}, cors=True)
            return

        try:
            length = min(65536, max(0, int(self.headers.get("Content-Length", "0"))))
            raw_body = self.rfile.read(length) if length > 0 else b"{}"
            payload = json.loads(raw_body.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("invalid payload")
        except Exception:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_json"}, cors=True)
            return

        country = (
            clean_str(self.headers.get("CF-IPCountry"), 8)
            or clean_str(self.headers.get("X-Country"), 8)
            or "XX"
        ).upper()
        if country in {"T1", "XX", ""}:
            country = "XX"

        try:
            record_event(payload, country)
        except Exception as exc:
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)}, cors=True)
            return

        self._send_json(HTTPStatus.OK, {"ok": True}, cors=True)


def main() -> None:
    init_db()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), TelemetryHandler)
    print(f"Overridle Telemetry listening on 0.0.0.0:{PORT} (db={DB_PATH})", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
