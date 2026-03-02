#!/usr/bin/env python3
"""
JRVS V3 Conversational Latency Analysis
========================================
Pulls the last 10 Maya JRVS conversations >= 5 minutes, extracts per-turn
timing data, cross-references each turn with the active node and assigned LLM.

Step 0 findings (schema inspection):
- time_in_call_secs: integer, second-level timestamps per turn
- conversation_turn_metrics.metrics.convai_llm_service_ttfb: float seconds,
  high-precision LLM time-to-first-byte — used as primary latency metric
- conversation_turn_metrics.metrics.convai_tts_service_ttfb: float seconds, TTS TTFB
- agent_metadata.workflow_node_id: present on all agent turns — Approach A
  node attribution, no guesswork needed
- No sub-endpoints at /analytics or /metrics (404)
- All 15 spoke nodes inherit root LLM (no per-node overrides found)
- Duplicate turns at same time_in_call_secs = tool-call prep turns — deduplicated
  by keeping the turn with the highest-priority content (speech > tool-only > empty)

Output:
  jrvs_v3_latency_raw.json       — per-turn records for all analyzed conversations
  jrvs_v3_latency_summary.md     — statistics by node, by LLM, overall, outlier list
"""

import json
import os
import sys
import statistics
import math
from datetime import datetime, timezone
from typing import Optional
import urllib.request
import urllib.error

AGENT_ID = "agent_0401khmtcyfef6hbpcvchjv5jj02"
BASE_URL = "https://api.elevenlabs.io/v1/convai"
MIN_DURATION_SECS = 300  # 5 minutes
MAX_CONVERSATIONS = 10
OUTLIER_THRESHOLD_MS = 3000
ANALYSIS_DATE = "2026-03-01"


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def get_api_key() -> str:
    key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not key:
        sys.exit("ERROR: ELEVENLABS_API_KEY not set in environment")
    return key


def api_get(path: str, api_key: str, params: dict = None) -> dict:
    url = f"{BASE_URL}{path}"
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        url = f"{url}?{qs}"
    req = urllib.request.Request(url, headers={"xi-api-key": api_key})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        sys.exit(f"HTTP {e.code} on {url}: {body}")


# ---------------------------------------------------------------------------
# Step 1: Agent config → Node→LLM map
# ---------------------------------------------------------------------------

def build_node_llm_map(api_key: str) -> tuple[dict, str]:
    """
    Returns (node_map, root_llm) where node_map is:
      node_id -> {label, llm_model, llm_type, is_inherited}
    """
    print("[Step 1] Fetching agent config...")
    config = api_get(f"/agents/{AGENT_ID}", api_key)

    root_llm = (
        config.get("conversation_config", {})
        .get("agent", {})
        .get("prompt", {})
        .get("llm", "unknown")
    )
    print(f"  Root LLM: {root_llm}")

    # Workflow nodes are at config.workflow.nodes (a dict keyed by node_id)
    nodes_dict = config.get("workflow", {}).get("nodes", {})
    print(f"  Total workflow nodes: {len(nodes_dict)}")

    node_map = {}
    for node_id, node in nodes_dict.items():
        ntype = node.get("type", "?")
        if ntype == "start":
            continue  # start_node has no LLM config

        label = node.get("label", node_id)
        # Check for per-node LLM override in config.agent.prompt.llm
        node_prompt = (
            node.get("config", {}) or {}
        ).get("agent", {}).get("prompt", {})
        llm_model = node_prompt.get("llm", None) if node_prompt else None
        is_inherited = llm_model is None
        if is_inherited:
            llm_model = root_llm

        # llm_type: custom-llm if the model string is a URL, else native
        llm_type = "custom-llm" if ("http" in str(llm_model)) else "native"

        node_map[node_id] = {
            "label": label,
            "llm_model": llm_model,
            "llm_type": llm_type,
            "is_inherited": is_inherited,
        }

    print(f"  Mapped {len(node_map)} spoke nodes")
    for nid, info in node_map.items():
        inherited_str = " (inherited)" if info["is_inherited"] else " (override)"
        print(f"    {info['label']:<28} {info['llm_model']}{inherited_str}")

    return node_map, root_llm


# ---------------------------------------------------------------------------
# Step 2: Fetch conversations — filter for >= 5 minutes
# ---------------------------------------------------------------------------

def fetch_qualifying_conversations(api_key: str) -> list[dict]:
    """Fetch paginated conversation list, return up to 10 with duration >= 300s."""
    print(f"\n[Step 2] Fetching conversations for agent {AGENT_ID}...")
    qualifying = []
    cursor = None
    page = 0

    while len(qualifying) < MAX_CONVERSATIONS:
        params = {
            "agent_id": AGENT_ID,
            "page_size": 100,
        }
        if cursor:
            params["cursor"] = cursor

        data = api_get("/conversations", api_key, params)
        conversations = data.get("conversations", [])
        page += 1
        print(f"  Page {page}: {len(conversations)} conversations retrieved")

        for conv in conversations:
            duration = conv.get("call_duration_secs", 0) or 0
            if duration >= MIN_DURATION_SECS:
                qualifying.append({
                    "conversation_id": conv["conversation_id"],
                    "start_time": conv.get("start_time_unix_secs"),
                    "duration_seconds": duration,
                    "status": conv.get("status", "unknown"),
                    "call_successful": conv.get("call_successful"),
                    "message_count": conv.get("message_count", 0),
                })
                if len(qualifying) >= MAX_CONVERSATIONS:
                    break

        has_more = data.get("has_more", False)
        cursor = data.get("next_cursor")
        if not has_more or not cursor:
            break

    print(f"  Found {len(qualifying)} qualifying conversations (>= {MIN_DURATION_SECS}s)")
    for c in qualifying:
        dt = datetime.fromtimestamp(c["start_time"], tz=timezone.utc).strftime("%Y-%m-%d %H:%M") if c["start_time"] else "?"
        print(f"    {c['conversation_id']}  {dt}  {c['duration_seconds']}s  msgs={c['message_count']}")

    return qualifying


# ---------------------------------------------------------------------------
# Step 3 & 4: Per-turn latency extraction + node attribution
# ---------------------------------------------------------------------------

TURN_PRIORITY = {"speech": 3, "tool_only": 2, "empty": 1}


def turn_priority(turn: dict) -> int:
    msg = turn.get("message") or ""
    tool_calls = turn.get("tool_calls") or []
    if msg.strip():
        return TURN_PRIORITY["speech"]
    if tool_calls:
        return TURN_PRIORITY["tool_only"]
    return TURN_PRIORITY["empty"]


def deduplicate_turns(transcript: list[dict]) -> list[dict]:
    """
    Agent turns can have duplicate time_in_call_secs entries (tool-call prep
    turns alongside the speech turn). Group by time and keep highest-priority.
    User turns are not duplicated.
    """
    from itertools import groupby

    # Preserve order, group consecutive same-time agent turns
    cleaned = []
    i = 0
    while i < len(transcript):
        turn = transcript[i]
        if turn["role"] != "agent":
            cleaned.append(turn)
            i += 1
            continue

        t = turn["time_in_call_secs"]
        # Collect all consecutive agent turns at this timestamp
        group = [turn]
        j = i + 1
        while j < len(transcript) and transcript[j]["role"] == "agent" and transcript[j]["time_in_call_secs"] == t:
            group.append(transcript[j])
            j += 1

        # Keep highest priority
        best = max(group, key=turn_priority)
        cleaned.append(best)
        i = j

    return cleaned


def extract_turns(conv_id: str, transcript: list[dict], node_map: dict, root_llm: str) -> list[dict]:
    """
    Extract per-agent-turn records with latency and node attribution.
    Returns list of turn dicts.
    """
    cleaned = deduplicate_turns(transcript)
    records = []
    turn_index = 0

    for idx, turn in enumerate(cleaned):
        if turn["role"] != "agent":
            continue

        # Skip turns with no content at all (pure empty artifacts)
        msg = turn.get("message") or ""
        tool_calls = turn.get("tool_calls") or []
        if not msg.strip() and not tool_calls:
            continue

        # ---- Node attribution (Approach A) ----
        node_id = (turn.get("agent_metadata") or {}).get("workflow_node_id", "unknown")
        node_info = node_map.get(node_id, {
            "label": f"unknown:{node_id[:20]}",
            "llm_model": root_llm,
            "llm_type": "native",
            "is_inherited": True,
        })

        # ---- Latency metrics ----
        metrics = (turn.get("conversation_turn_metrics") or {}).get("metrics", {}) or {}

        llm_ttfb_raw = metrics.get("convai_llm_service_ttfb", {})
        llm_ttfb_ms = round(llm_ttfb_raw.get("elapsed_time", 0) * 1000) if llm_ttfb_raw else None

        tts_ttfb_raw = metrics.get("convai_tts_service_ttfb", {})
        tts_ttfb_ms = round(tts_ttfb_raw.get("elapsed_time", 0) * 1000) if tts_ttfb_raw else None

        ttf_sentence_raw = metrics.get("convai_llm_service_ttf_sentence", {})
        ttf_sentence_ms = round(ttf_sentence_raw.get("elapsed_time", 0) * 1000) if ttf_sentence_raw else None

        # Response latency = time from end of previous user turn to this agent turn start.
        # Only second-level resolution from time_in_call_secs.
        agent_time = turn.get("time_in_call_secs", 0)
        prev_user_time = None
        for prev in reversed(cleaned[:idx]):
            if prev["role"] == "user":
                prev_user_time = prev.get("time_in_call_secs", 0)
                break
        gap_secs = (agent_time - prev_user_time) if prev_user_time is not None else None
        response_latency_ms = gap_secs * 1000 if gap_secs is not None else None

        # Turn duration: seconds until next turn starts
        next_time = None
        for nxt in cleaned[idx + 1:]:
            next_time_val = nxt.get("time_in_call_secs")
            if next_time_val is not None and next_time_val > agent_time:
                next_time = next_time_val
                break
        turn_duration_ms = (next_time - agent_time) * 1000 if next_time is not None else None

        # Content counts
        words = len(msg.split()) if msg.strip() else 0
        chars = len(msg)

        # Timestamp ISO
        timestamp_iso = None  # absolute timestamp not available per turn; use conv start + offset

        records.append({
            "conversation_id": conv_id,
            "turn_index": turn_index,
            "time_in_call_secs": agent_time,
            "role": "agent",
            "active_node_id": node_id,
            "active_node": node_info["label"],
            "active_llm": node_info["llm_model"],
            "llm_type": node_info["llm_type"],
            "llm_ttfb_ms": llm_ttfb_ms,                # LLM component only (high-precision)
            "tts_ttfb_ms": tts_ttfb_ms,                # TTS component
            "ttf_first_sentence_ms": ttf_sentence_ms,  # time to first complete sentence
            "response_latency_secs_coarse": gap_secs,  # full gap (second-level only)
            "turn_duration_ms": turn_duration_ms,
            "response_word_count": words,
            "response_char_count": chars,
            "has_tool_calls": bool(tool_calls),
            "tool_names": [tc.get("tool_name", "") for tc in tool_calls] if tool_calls else [],
            "interrupted": turn.get("interrupted", False),
            "node_attribution_method": "Approach A (workflow_node_id in agent_metadata)",
        })
        turn_index += 1

    return records


# ---------------------------------------------------------------------------
# Statistics helpers
# ---------------------------------------------------------------------------

def percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    idx = (len(sorted_vals) - 1) * p / 100
    lo = int(idx)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = idx - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


def stats(values: list[float]) -> dict:
    if not values:
        return {"count": 0, "mean": None, "median": None, "min": None, "max": None, "p95": None, "p75": None}
    s = sorted(values)
    return {
        "count": len(s),
        "mean": round(statistics.mean(s), 1),
        "median": round(statistics.median(s), 1),
        "min": round(s[0], 1),
        "max": round(s[-1], 1),
        "p75": round(percentile(s, 75), 1),
        "p95": round(percentile(s, 95), 1),
    }


# ---------------------------------------------------------------------------
# Step 5: Build outputs
# ---------------------------------------------------------------------------

def build_summary_md(
    all_turns: list[dict],
    qualifying: list[dict],
    root_llm: str,
    node_map: dict,
) -> str:
    lines = []

    def h1(t): lines.append(f"# {t}\n")
    def h2(t): lines.append(f"## {t}\n")
    def h3(t): lines.append(f"### {t}\n")
    def rule(): lines.append("---\n")
    def blank(): lines.append("")

    h1("JRVS V3 Conversational Latency Report")
    lines.append(f"**Analysis date:** {ANALYSIS_DATE}  ")
    lines.append(f"**Agent:** `{AGENT_ID}`  ")
    lines.append(f"**TTS model:** `eleven_v3_conversational`  ")
    lines.append(f"**Root LLM:** `{root_llm}`  ")
    lines.append(f"**Conversations analyzed:** {len(qualifying)}  ")
    blank()

    # ---- Schema note ----
    h2("Data Schema Notes")
    lines.append("- **Primary latency metric:** `convai_llm_service_ttfb` — LLM time-to-first-byte (float seconds, high precision). This measures the LLM inference component only.")
    lines.append("- **`response_latency_secs_coarse`:** Time from preceding user turn start to this agent turn start, derived from `time_in_call_secs` (integer, second-level resolution only). Use for rough user-perceived latency.")
    lines.append("- **Node attribution:** Approach A — `workflow_node_id` present on every agent turn in `agent_metadata`. No guesswork required.")
    lines.append("- **All 15 spoke nodes** inherit the root LLM (`claude-sonnet-4-5`). No per-node overrides detected.")
    lines.append("- **No sub-endpoints** at `/analytics` or `/metrics` — all data from conversation detail endpoint.")
    blank()

    # ---- Conversations analyzed ----
    h2("Conversations Analyzed")
    lines.append("| conversation_id | start_time (UTC) | duration | turns_analyzed | status |")
    lines.append("|---|---|---|---|---|")
    conv_turn_counts = {}
    for t in all_turns:
        cid = t["conversation_id"]
        conv_turn_counts[cid] = conv_turn_counts.get(cid, 0) + 1

    for c in qualifying:
        dt = datetime.fromtimestamp(c["start_time"], tz=timezone.utc).strftime("%Y-%m-%d %H:%M") if c["start_time"] else "?"
        mins = c["duration_seconds"] // 60
        secs = c["duration_seconds"] % 60
        dur_str = f"{mins}m {secs}s"
        n_turns = conv_turn_counts.get(c["conversation_id"], 0)
        lines.append(f"| `{c['conversation_id']}` | {dt} | {dur_str} | {n_turns} | {c['status']} |")
    blank()

    # ---- Overall stats ----
    h2("Overall Statistics")
    agent_turns = [t for t in all_turns]
    total_turns = len(agent_turns)
    llm_ttfbs = [t["llm_ttfb_ms"] for t in agent_turns if t["llm_ttfb_ms"] is not None]
    coarse_latencies = [t["response_latency_secs_coarse"] * 1000 for t in agent_turns if t["response_latency_secs_coarse"] is not None]
    avg_duration = statistics.mean([c["duration_seconds"] for c in qualifying]) if qualifying else 0

    lines.append(f"- **Total agent turns analyzed:** {total_turns}")
    lines.append(f"- **Turns with LLM TTFB data:** {len(llm_ttfbs)} ({round(100*len(llm_ttfbs)/total_turns if total_turns else 0)}%)")
    lines.append(f"- **Average conversation duration:** {round(avg_duration/60, 1)} minutes")
    blank()

    if llm_ttfbs:
        s = stats(llm_ttfbs)
        lines.append("**LLM TTFB (ms) — global:**")
        lines.append(f"| Mean | Median | Min | Max | P75 | P95 |")
        lines.append(f"|---|---|---|---|---|---|")
        lines.append(f"| {s['mean']} | {s['median']} | {s['min']} | {s['max']} | {s['p75']} | {s['p95']} |")
    blank()

    # ---- Per-node stats ----
    h2("Per-Node Breakdown")
    lines.append("*Latency = LLM TTFB in ms (high precision). All nodes inherit root LLM `claude-sonnet-4-5`.*")
    blank()

    from collections import defaultdict
    node_turns = defaultdict(list)
    for t in agent_turns:
        node_turns[t["active_node"]].append(t)

    # Sort by turn count desc
    sorted_nodes = sorted(node_turns.items(), key=lambda x: -len(x[1]))
    lines.append("| Node | LLM | Turns | Mean TTFB | Median | Min | Max | P95 | Interrupted% |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for node_label, turns in sorted_nodes:
        ttfbs = [t["llm_ttfb_ms"] for t in turns if t["llm_ttfb_ms"] is not None]
        llm = turns[0]["active_llm"] if turns else root_llm
        interrupted = sum(1 for t in turns if t.get("interrupted"))
        int_pct = round(100 * interrupted / len(turns)) if turns else 0
        if ttfbs:
            s = stats(ttfbs)
            lines.append(f"| {node_label} | `{llm}` | {len(turns)} | {s['mean']} | {s['median']} | {s['min']} | {s['max']} | {s['p95']} | {int_pct}% |")
        else:
            lines.append(f"| {node_label} | `{llm}` | {len(turns)} | N/A | N/A | N/A | N/A | N/A | {int_pct}% |")
    blank()

    # ---- Per-LLM stats ----
    h2("Per-LLM Breakdown")
    llm_turns = defaultdict(list)
    for t in agent_turns:
        llm_turns[t["active_llm"]].append(t)

    lines.append("| LLM Model | Turns | Mean TTFB | Median | Min | Max | P95 | Nodes Using |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for llm_model, turns in sorted(llm_turns.items(), key=lambda x: -len(x[1])):
        ttfbs = [t["llm_ttfb_ms"] for t in turns if t["llm_ttfb_ms"] is not None]
        nodes_using = sorted(set(t["active_node"] for t in turns))
        nodes_str = ", ".join(nodes_using[:4]) + ("..." if len(nodes_using) > 4 else "")
        if ttfbs:
            s = stats(ttfbs)
            lines.append(f"| `{llm_model}` | {len(turns)} | {s['mean']} | {s['median']} | {s['min']} | {s['max']} | {s['p95']} | {nodes_str} |")
        else:
            lines.append(f"| `{llm_model}` | {len(turns)} | N/A | N/A | N/A | N/A | N/A | {nodes_str} |")
    blank()

    # ---- Distribution of turns by node ----
    h2("Turn Distribution by Node")
    lines.append("| Node | Turns | % of Total |")
    lines.append("|---|---|---|")
    for node_label, turns in sorted_nodes:
        pct = round(100 * len(turns) / total_turns) if total_turns else 0
        lines.append(f"| {node_label} | {len(turns)} | {pct}% |")
    blank()

    # ---- LLM TTFB distribution buckets ----
    h2("LLM TTFB Distribution (Histogram)")
    lines.append("*LLM TTFB buckets across all turns with data.*")
    blank()
    buckets = {"<500ms": 0, "500-999ms": 0, "1000-1999ms": 0, "2000-2999ms": 0, "3000-4999ms": 0, "≥5000ms": 0}
    for v in llm_ttfbs:
        if v < 500: buckets["<500ms"] += 1
        elif v < 1000: buckets["500-999ms"] += 1
        elif v < 2000: buckets["1000-1999ms"] += 1
        elif v < 3000: buckets["2000-2999ms"] += 1
        elif v < 5000: buckets["3000-4999ms"] += 1
        else: buckets["≥5000ms"] += 1
    lines.append("| Bucket | Count | % |")
    lines.append("|---|---|---|")
    total_with_data = len(llm_ttfbs)
    for bucket, count in buckets.items():
        pct = round(100 * count / total_with_data) if total_with_data else 0
        lines.append(f"| {bucket} | {count} | {pct}% |")
    blank()

    # ---- Outliers ----
    h2(f"Outlier Turns (LLM TTFB > {OUTLIER_THRESHOLD_MS}ms)")
    outliers = [t for t in agent_turns if t["llm_ttfb_ms"] is not None and t["llm_ttfb_ms"] > OUTLIER_THRESHOLD_MS]
    outliers.sort(key=lambda x: -(x["llm_ttfb_ms"] or 0))
    lines.append(f"**{len(outliers)} outlier turns found.**")
    blank()
    if outliers:
        lines.append("| conversation_id | turn_index | t (secs) | Node | LLM TTFB (ms) | Words | Interrupted |")
        lines.append("|---|---|---|---|---|---|---|")
        for t in outliers:
            lines.append(
                f"| `{t['conversation_id'][:30]}` | {t['turn_index']} | {t['time_in_call_secs']}s "
                f"| {t['active_node']} | **{t['llm_ttfb_ms']}** | {t['response_word_count']} | {t['interrupted']} |"
            )
    blank()

    # ---- Tool call analysis ----
    h2("Tool Call Analysis")
    turns_with_tools = [t for t in agent_turns if t.get("has_tool_calls")]
    tool_counts = defaultdict(int)
    for t in turns_with_tools:
        for tn in t.get("tool_names", []):
            tool_counts[tn] += 1
    lines.append(f"- **Turns with tool calls:** {len(turns_with_tools)} / {total_turns} ({round(100*len(turns_with_tools)/total_turns if total_turns else 0)}%)")
    blank()
    if tool_counts:
        lines.append("| Tool | Call count |")
        lines.append("|---|---|")
        for tool, cnt in sorted(tool_counts.items(), key=lambda x: -x[1]):
            lines.append(f"| `{tool}` | {cnt} |")
    blank()

    # ---- TTS TTFB ----
    h2("TTS TTFB Statistics")
    tts_vals = [t["tts_ttfb_ms"] for t in agent_turns if t["tts_ttfb_ms"] is not None]
    lines.append(f"*Turns with TTS TTFB data: {len(tts_vals)}*")
    if tts_vals:
        s = stats(tts_vals)
        lines.append(f"| Mean | Median | Min | Max | P95 |")
        lines.append(f"|---|---|---|---|---|")
        lines.append(f"| {s['mean']} | {s['median']} | {s['min']} | {s['max']} | {s['p95']} |")
    blank()

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    api_key = get_api_key()

    # Step 1: Node→LLM map
    node_map, root_llm = build_node_llm_map(api_key)

    # Step 2: Qualifying conversations
    qualifying = fetch_qualifying_conversations(api_key)
    if not qualifying:
        print(f"No conversations >= {MIN_DURATION_SECS}s found. Exiting.")
        return

    # Step 3 & 4: Per-turn extraction
    all_turns = []
    print(f"\n[Step 3/4] Extracting per-turn data from {len(qualifying)} conversations...")
    for c in qualifying:
        cid = c["conversation_id"]
        print(f"  Fetching {cid} ({c['duration_seconds']}s)...")
        detail = api_get(f"/conversations/{cid}", api_key)
        transcript = detail.get("transcript", []) or []
        turns = extract_turns(cid, transcript, node_map, root_llm)
        print(f"    → {len(transcript)} raw turns → {len(turns)} agent turns extracted")
        all_turns.extend(turns)

    print(f"\n  Total agent turns: {len(all_turns)}")

    # Step 5: Output
    print("\n[Step 5] Writing outputs...")
    output_dir = os.path.dirname(os.path.abspath(__file__))

    # Raw JSON
    raw_output = {
        "agent_id": AGENT_ID,
        "analysis_date": ANALYSIS_DATE,
        "tts_model": "eleven_v3_conversational",
        "root_llm": root_llm,
        "conversations_analyzed": len(qualifying),
        "total_agent_turns": len(all_turns),
        "node_llm_map": {
            nid: info for nid, info in node_map.items()
        },
        "conversations": qualifying,
        "turns": all_turns,
    }
    raw_path = os.path.join(output_dir, "jrvs_v3_latency_raw.json")
    with open(raw_path, "w") as f:
        json.dump(raw_output, f, indent=2)
    print(f"  Wrote {raw_path}")

    # Summary MD
    summary_md = build_summary_md(all_turns, qualifying, root_llm, node_map)
    md_path = os.path.join(output_dir, "jrvs_v3_latency_summary.md")
    with open(md_path, "w") as f:
        f.write(summary_md)
    print(f"  Wrote {md_path}")

    print("\n=== DONE ===")
    print(f"Conversations analyzed: {len(qualifying)}")
    llm_ttfbs = [t["llm_ttfb_ms"] for t in all_turns if t["llm_ttfb_ms"] is not None]
    if llm_ttfbs:
        s = stats(llm_ttfbs)
        print(f"Global LLM TTFB — mean: {s['mean']}ms  median: {s['median']}ms  p95: {s['p95']}ms")
    outliers = [t for t in all_turns if t["llm_ttfb_ms"] is not None and t["llm_ttfb_ms"] > OUTLIER_THRESHOLD_MS]
    print(f"Outlier turns (>{OUTLIER_THRESHOLD_MS}ms): {len(outliers)}")


if __name__ == "__main__":
    main()
