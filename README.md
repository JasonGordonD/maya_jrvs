# JRVS Dashboard — Maya AI Assistant

JRVS Dashboard is the Next.js command interface for **Maya**, the JRVS conversational AI assistant. It provides live voice and text conversations, real-time transcript management, agent introspection, operational logging, and automatic session continuity through a multi-service architecture spanning **ElevenLabs Conversational AI**, **Supabase** (database, edge functions, storage), and **Anthropic Claude / Voyage AI** for summarization and embedding.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Variables](#environment-variables)
3. [Architecture Overview](#architecture-overview)
4. [Dashboard Features](#dashboard-features)
   - [Voice Mode](#voice-mode)
   - [Text Mode](#text-mode)
   - [Audio Input Modes](#audio-input-modes)
   - [Microphone Selector](#microphone-selector)
   - [Live Transcript](#live-transcript)
   - [Transcript Search](#transcript-search)
   - [Transcript Export](#transcript-export)
   - [Session History](#session-history)
   - [Tool Call Log](#tool-call-log)
   - [Error Log](#error-log)
   - [Active Node Indicator](#active-node-indicator)
   - [Connection Status Indicator](#connection-status-indicator)
   - [Session Timer](#session-timer)
   - [Automatic Session Restart](#automatic-session-restart)
   - [Agent Config Inspector](#agent-config-inspector)
   - [File Attachments](#file-attachments)
   - [Structured Content Display](#structured-content-display)
   - [Image Rendering](#image-rendering)
   - [Keyboard Shortcuts](#keyboard-shortcuts)
5. [API Routes](#api-routes)
6. [ElevenLabs Integration](#elevenlabs-integration)
   - [Conversational AI Agent](#conversational-ai-agent)
   - [Signed URL Authentication](#signed-url-authentication)
   - [Scribe Real-Time Speech-to-Text](#scribe-real-time-speech-to-text)
   - [Agent Config Snapshot](#agent-config-snapshot)
   - [Transcript Fetch](#transcript-fetch)
7. [Supabase Integration](#supabase-integration)
   - [Project Details](#project-details)
   - [Database Tables](#database-tables)
   - [Edge Functions](#edge-functions)
   - [Session Summarization Pipeline](#session-summarization-pipeline)
8. [Client Tools (Agent-to-Dashboard)](#client-tools-agent-to-dashboard)
9. [Session Flow](#session-flow)
10. [Component Reference](#component-reference)
11. [Latency Analysis Tooling](#latency-analysis-tooling)
12. [Scripts](#scripts)
13. [Tech Stack](#tech-stack)
14. [Development Commands](#development-commands)
15. [Branch Protocol](#branch-protocol)

---

## Quick Start

```bash
npm install
cp .env.example .env.local   # fill in required values
npm run dev
# Open http://localhost:3000
```

For Cursor/CC agent sessions, run the setup script first:

```bash
bash scripts/mjrvs_agent_setup.sh
```

---

## Environment Variables

Create a `.env.local` file from `.env.example`. All variables listed below are required unless noted otherwise.

| Variable | Required | Scope | Purpose |
|---|---|---|---|
| `MJRVS_ELEVENLABS_AGENT_ID` | Yes | Server | The JRVS agent ID on ElevenLabs. Canonical source — never use `ELEVENLABS_AGENT_ID` for JRVS. |
| `ELEVENLABS_API_KEY` | Yes | Server | ElevenLabs API key for signed URLs, Scribe tokens, agent config fetches, and transcript retrieval. Never exposed client-side. |
| `SUPABASE_URL` | Yes | Server | Supabase project URL (see Supabase dashboard for the value). |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server | Supabase service role key for edge function invocation and direct DB access. |
| `ANTHROPIC_API_KEY` | Yes | Edge Function | Claude API key used by the `mjrvs_summarize_session` edge function for conversation summarization. |
| `VOYAGE_API_KEY` | Yes | Edge Function | Voyage AI key used by the `mjrvs_summarize_session` edge function for embedding generation. |
| `ELEVEN_LABS_API_KEY` | Fallback | Server | Alternative env name for the ElevenLabs API key. |
| `VITE_ELEVENLABS_API_KEY` | Fallback | Server | Another fallback env name for the ElevenLabs API key. |

The server-side env resolution logic lives in `lib/server-env.ts`. It checks multiple candidate variable names (including case-insensitive fallback) to maximize compatibility across deployment environments.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                   JRVS Dashboard (Next.js)               │
│                                                          │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Signed   │  │ Scribe Token │  │ Agent Config       │  │
│  │ URL API  │  │ API          │  │ Snapshot API       │  │
│  └────┬─────┘  └──────┬───────┘  └────────┬───────────┘  │
│       │               │                   │              │
│  ┌────▼─────────────────────────────────────────────────┐ │
│  │              ConversationBar Component               │ │
│  │  Voice / Text mode, file attachments, mute, keyboard │ │
│  └────┬─────────────────────────────────────────────────┘ │
│       │                                                  │
│  ┌────▼──────────────────────────────────────────┐       │
│  │           Main Dashboard Page (page.tsx)       │       │
│  │  Transcript, Tool Log, Error Log, Session     │       │
│  │  History, Config Inspector, Node Tracker      │       │
│  └────┬──────────────────────────────────────────┘       │
│       │                                                  │
│  ┌────▼──────────────────────────────────────────┐       │
│  │     Summarize-Session API Route (proxy)       │       │
│  └────┬──────────────────────────────────────────┘       │
└───────┼──────────────────────────────────────────────────┘
        │
   ┌────▼───────────────────────────────────────────────┐
   │              ElevenLabs Platform                   │
   │  Conversational AI Agent (WebSocket)               │
   │  Scribe v2 Real-Time STT                          │
   │  Agent Config API · Transcript API                 │
   │  TTS: eleven_v3_conversational                     │
   │  Root LLM: claude-sonnet-4-5                       │
   └────────────────────────────────────────────────────┘
        │
   ┌────▼───────────────────────────────────────────────┐
   │              Supabase (PRMPT project)              │
   │  Database: mjrvs_memories, mjrvs_episodes,         │
   │    mjrvs_conversations, mjrvs_state,               │
   │    mjrvs_documents, mjrvs_chunks, ...              │
   │  Edge Functions: mjrvs_summarize_session,          │
   │    mjrvs_memory, mjrvs_vision, mjrvs_post, ...     │
   │  Storage: document uploads, video uploads          │
   └────────────────────────────────────────────────────┘
        │
   ┌────▼───────────────────────────────────────────────┐
   │              External AI Services                  │
   │  Anthropic Claude Opus 4.6 (summarization)         │
   │  Voyage AI voyage-4-large (embeddings)             │
   └────────────────────────────────────────────────────┘
```

---

## Dashboard Features

### Voice Mode

The default conversation mode. The dashboard connects to the ElevenLabs Conversational AI agent over WebSocket using a server-generated signed URL. Audio is captured from the user's microphone (or system audio — see Audio Input Modes) and streamed to the agent. The agent responds with synthesized speech via the `eleven_v3_conversational` TTS model.

- Press the phone icon to start/end a session.
- Press `M` (when no input is focused) to toggle microphone mute.
- A "Speaking..." indicator pulses when the agent is producing audio.

### Text Mode

An alternative mode where the conversation uses text-only messaging instead of voice. Toggle between Voice and Text mode using the mode selector below the transcript. Mode cannot be changed while a session is active.

In text mode:
- The keyboard input area opens automatically on connection.
- Audio controls (mute, keyboard toggle) are hidden.
- Messages are sent via `sendUserMessage` through the ElevenLabs SDK.
- Press Enter to send, Shift+Enter for newlines.

### Audio Input Modes

Three audio capture strategies are available in voice mode:

| Mode | Label | Behavior |
|---|---|---|
| `mic` | Mic Only | Standard microphone capture via `getUserMedia`. |
| `device` | Device Audio | System/tab audio via `getDisplayMedia`. The user shares a browser tab or window with audio. |
| `mixed` | Mic + Device Audio | Both microphone and system audio mixed together using the Web Audio API (`MediaStreamDestination`). |

Changing audio mode during an active session triggers a session restart with user confirmation.

### Microphone Selector

The `MicSelector` component enumerates available audio input devices and provides a dropdown for selection. It includes a live waveform preview (canvas-based `LiveWaveform` component) so you can verify the selected microphone is picking up audio before starting a session.

### Live Transcript

The central panel displays a scrolling transcript of the conversation in real time. Each message shows:

- Timestamp in `HH:MM:SS` format.
- Speaker label: "You" for user messages, "Maya" for AI responses, or a custom label for structured content.
- Full message text with streaming markdown rendering (powered by `streamdown` + `react-markdown` + `remark-gfm`).
- A hover-to-reveal copy button on each individual message.

AI messages are intelligently merged: if the agent sends incremental chunks, they are concatenated into a single coherent message entry.

### Transcript Search

Press `Ctrl+F` (or `Cmd+F` on macOS) to open the transcript search bar. Features:

- Case-insensitive text search across all visible transcript messages.
- Match highlighting with amber background for all matches, emerald for the active match.
- Match counter showing "X of Y matches".
- Navigate between matches with Enter (next) / Shift+Enter (previous), or the arrow buttons.
- Press Escape to close the search bar and clear highlights.

The search uses DOM-level `TreeWalker` to find and wrap text nodes in `<mark>` elements, with automatic cleanup on close or query change.

### Transcript Export

Two export options are available from the transcript header:

- **Copy**: Copies the entire transcript as plain text (`[HH:MM:SS] Speaker: message` format) to the clipboard.
- **Download**: Exports the transcript as a Markdown file with metadata (date, session ID, duration) in the format `mjrvs_trans_MMDDYY_HHMM.md`.

### Session History

Click the "History" button in the header to open the session history sidebar. It shows all sessions from the current browser session (stored in memory, not persisted to disk):

- Active sessions have a green border and "Active" badge.
- Ended sessions show duration and can be clicked to view their cached transcript.
- Each session can be renamed with a custom label via the "Rename" button.
- When viewing a cached session, the transcript panel switches to "Cached Transcript" mode with an amber banner and a "Back to live" button.
- Sessions are ordered with the active session first, then by most recent start time.

### Tool Call Log

The right sidebar (desktop) or tabbed panel (mobile) displays a live log of tool calls made by the agent during the session. Each entry shows:

- Timestamp.
- Tool name (e.g., `mjrvs_docs`, `google_search`, `maya_memory`).
- Action description (if available).
- Parameters summary (truncated).
- Result summary.

Tool calls are detected from both:
1. The `report_tool_dispatch` client tool (authoritative — sent by the agent).
2. Heuristic text parsing of agent debug events (fallback — pattern matches for tool-related keywords like `mjrvs_`, `tool_call`, `dispatch`).

The panel is collapsible and its contents can be copied to the clipboard.

### Error Log

Below the tool log, the error panel captures and displays all conversation errors with severity-based styling:

| Severity | Visual | Triggers |
|---|---|---|
| `auth` | Red border/background | 401, 403, "unauthorized", "forbidden" |
| `timeout` | Yellow border/background | "timeout", "timed out", "ETIMEDOUT" |
| `connection` | Neutral border | "connection", "network", "websocket", "disconnect" |
| `error` | Dark red | Tool dispatch failures with `is_error: true` |
| `other` | Neutral | Anything else |

Each error entry shows the timestamp, message, error type, code, and details. The full error log can be copied to clipboard.

### Active Node Indicator

The header displays the currently active workflow node reported by the agent (e.g., "Qualification", "Dr. Noir", "Thought Partner", "Coding", "VAG"). The node name and type are updated via the `report_active_node` client tool.

When no authoritative node update has been received (or at session start), the indicator shows "—".

### Connection Status Indicator

A colored dot in the header indicates the connection state:

| Status | Dot Color | Label |
|---|---|---|
| Connected | Emerald | Live |
| Disconnected | Gray | Ready |
| Connecting | Amber (pulsing) | Connecting... |
| Disconnecting | Amber (pulsing) | Ending session... |

### Session Timer

A monospace timer in the header shows elapsed session duration in `MM:SS` or `H:MM:SS` format, updated every second while connected.

### Automatic Session Restart

To maintain conversation quality, sessions automatically restart after **40 minutes**:

1. At the 40-minute mark, a warning banner appears with a 60-second countdown.
2. The user can click "Restart Now" to restart immediately, or "Dismiss" to suppress the warning (the auto-restart still fires at countdown zero).
3. When the restart triggers:
   - The dashboard calls `/api/mjrvs/summarize-session` to summarize and persist the session to Supabase.
   - The current session disconnects.
   - A new session starts automatically.
   - A contextual update ("Session context restored. Previous session summary loaded into memory.") is sent to the agent on reconnect.
   - A system message appears in the transcript: "Session restarted — context preserved".

### Agent Config Inspector

Click the "Agent Config" button in the header to open a full-width sliding panel that displays the complete ElevenLabs agent configuration decomposed into inspectable sections:

- **Transfer Map**: Visual representation of all workflow nodes and their outgoing edges with forward conditions. Nodes are clickable to jump to their prompt details.
- **Root Prompt**: The main system prompt for the agent, including LLM assignment.
- **Nodes**: Each workflow node's additional prompt, LLM assignment, tool list, and configuration.
- **Edges**: Transfer conditions between nodes (forward and backward).
- **Tools**: All registered tools with their schemas, types, and which nodes they are assigned to.
- **Global Config**: LLM selection (model, temperature, reasoning effort, backup config, cascade timeout), TTS settings, turn configuration, conversation initiation settings (first message, language, interruption settings).

Features:
- **Lazy loading**: Config is fetched from `/api/agent-config` on first open.
- **Cache vs. Live**: Shows whether the snapshot was served from server cache or fetched live.
- **Refresh**: Force-refresh the snapshot from ElevenLabs at any time.
- **Copy**: Each config chunk has a copy button.
- **Collapsible sections**: All groups and individual items are expandable/collapsible.
- **Escape to close**: Press Escape or click the backdrop to dismiss.

The config snapshot logic (`lib/mjrvs_config_snapshot.ts`) parses the raw ElevenLabs agent payload into structured chunks, resolves tool-to-node registrations, normalizes edge conditions, and builds the transfer map.

### File Attachments

In both voice and text mode, you can attach files to the conversation:

- Click the paperclip icon to open the file picker.
- Supported file types: `.pdf`, `.txt`, `.md`, `.docx`, `.json`, `.csv`, `.png`, `.jpg`, `.jpeg`.
- Text-based files (`.txt`, `.md`, `.json`, `.csv`) are read in-browser and sent as contextual updates (up to 4000 characters, truncated with a notice if longer).
- Non-text files send metadata only (name, type, size).
- Multiple attachments can be queued before sending.
- Each attachment shows as a pill with a remove button.

### Structured Content Display

The agent can display rich structured content in the transcript via the `display_structured_content` client tool. This content is rendered as structured Markdown blocks with:

- An optional label (e.g., "Generated Image", "System").
- Full Markdown rendering with syntax highlighting for code blocks.
- A copy button for the raw content.

### Image Rendering

Generated images (from tool dispatch results containing `images` arrays with `url` and `revised_prompt` fields) are rendered inline in the transcript with:

- Responsive sizing (max 384px width).
- Rounded corners with a subtle border.
- Optional revised prompt caption in italic.
- Graceful error handling (images that fail to load are hidden).

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `M` | Toggle microphone mute (when no input is focused) |
| `Ctrl/Cmd + F` | Open transcript search |
| `Escape` | Close transcript search or Agent Config panel |
| `Enter` | Send text message (in text input) / Next search match |
| `Shift + Enter` | New line in text input / Previous search match |

---

## API Routes

### `GET /api/signed-url`

Fetches a signed WebSocket URL from ElevenLabs for the JRVS agent. Used by the `ConversationBar` to establish authenticated WebSocket connections.

- Uses `MJRVS_ELEVENLABS_AGENT_ID` and `ELEVENLABS_API_KEY`.
- Returns `{ signedUrl: string }`.

### `GET|POST /api/scribe-token`

Requests a real-time Scribe token from ElevenLabs for speech-to-text.

- Model: `scribe_v2_realtime`
- TTL: 300 seconds
- Returns `{ token: string }`.

### `GET /api/agent-config`

Returns the agent configuration snapshot. Serves from cache by default.

- Query params:
  - `?refresh=1` — force a live fetch from ElevenLabs.
  - `?agent_id=...` — override the agent ID.
- Returns snapshot with `chunks`, `snapshot_at`, `source` ("cache" or "live"), and `agent_name`.

### `POST /api/agent-config`

Forces a fresh agent config snapshot from ElevenLabs and returns it.

### `POST /api/mjrvs/summarize-session`

Proxies the request to the Supabase `mjrvs_summarize_session` edge function.

- Request body: `{ conversation_id, session_duration_minutes, turn_count }`
- Authenticates with `SUPABASE_SERVICE_ROLE_KEY`.
- Returns the edge function response (see [Session Summarization Pipeline](#session-summarization-pipeline)).

---

## ElevenLabs Integration

### Conversational AI Agent

The JRVS agent is deployed on ElevenLabs Conversational AI platform. Key characteristics:

- **Agent ID**: Resolved from `MJRVS_ELEVENLABS_AGENT_ID` environment variable.
- **TTS Model**: `eleven_v3_conversational`
- **Root LLM**: `claude-sonnet-4-5`
- **Workflow**: Multi-node agent with spoke nodes including Qualification, Dr. Noir, VAG, Thought Partner, and Coding.
- **Connection**: WebSocket via signed URL (server-authenticated).
- **SDK**: `@elevenlabs/react` v0.14.1 — `useConversation` hook.

The agent supports:
- Real-time voice conversation with interrupt handling.
- Text-only conversation mode.
- Client-side tool invocation (`display_structured_content`, `report_tool_dispatch`, `report_active_node`).
- Contextual updates (file attachments, session restoration messages).
- Post-connect context injection for session continuity.

### Signed URL Authentication

The `/api/signed-url` route fetches a time-limited signed URL from:
```
https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id={AGENT_ID}
```

This URL is passed to the `useConversation` hook's `startSession` method with `connectionType: "websocket"`. This keeps the API key server-side and provides secure, time-limited client access.

### Scribe Real-Time Speech-to-Text

The `useScribe` hook (`hooks/use-scribe.ts`) provides a comprehensive React integration for ElevenLabs Scribe v2 real-time STT:

- **Connection modes**: Microphone mode (automatic capture) or manual audio mode (base64 audio chunks).
- **VAD configuration**: Silence threshold, VAD threshold, min speech/silence duration.
- **Commit strategies**: Configurable via the `CommitStrategy` type.
- **Language support**: Configurable language code.
- **Transcript types**: Partial transcripts (streaming) and committed transcripts (final, with optional timestamps).
- **Error handling**: Granular error callbacks for auth errors, quota exceeded, rate limiting, queue overflow, resource exhaustion, session time limits, chunk size exceeded, and insufficient audio activity.
- **States**: `disconnected`, `connecting`, `connected`, `transcribing`, `error`.

The `/api/scribe-token` route provisions tokens with a 300-second TTL.

### Agent Config Snapshot

The `lib/mjrvs_config_snapshot.ts` module fetches and parses the full agent configuration from:
```
https://api.elevenlabs.io/v1/convai/agents/{AGENT_ID}
```

It decomposes the payload into structured chunks:

| Chunk Type | Content |
|---|---|
| `root_prompt` | Main system prompt, LLM assignment, full prompt config |
| `node_prompt` | Per-node additional prompt, LLM assignment, tool list |
| `edge_condition` | Source/target node names, forward/backward conditions |
| `tool_schema` | Tool name, type, config, registered nodes |
| `global_config` | LLM selection, TTS settings, turn config, initiation settings |

The module maintains an in-memory cache and supports both cached and live retrieval via `mjrvs_get_or_create_config_snapshot`.

### Transcript Fetch

The `mjrvs_summarize_session` edge function fetches conversation transcripts from:
```
https://api.elevenlabs.io/v1/convai/conversations/{CONVERSATION_ID}
```

Transcripts are formatted with speaker labels ("Maya" for agent, "Rami" for user) and passed to Claude for summarization.

---

## Supabase Integration

### Project Details

| Property | Value |
|---|---|
| **Project Name** | PRMPT |
| **Project Ref** | `svqbfxdhpsmioaosuhkb` |
| **Region** | us-west-2 |
| **Database** | PostgreSQL 17.6.1 |
| **Status** | Active Healthy |

### Database Tables

The following tables in the `public` schema are used by the JRVS system:

#### `mjrvs_memories` (697 rows)

The core knowledge store. Each memory has a semantic embedding for retrieval.

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `content` | text | Memory content |
| `category` | text | One of: `identity`, `relationship`, `principle`, `tool_knowledge`, `episodic`, `process_improvement`, `promoted_constraint`, `session_continuity`, `fact`, `canonical`, `open_item`, `decision` |
| `confidence` | text | `verified`, `inferred`, or `speculative` |
| `impact` | text | `critical`, `high`, `moderate`, or `low` |
| `importance` | float | Numeric importance weight (0.0–1.0) |
| `source` | text | Origin (e.g., `session_summarizer`, tool name) |
| `embedding` | vector | Voyage AI embedding for semantic search |
| `metadata` | jsonb | Arbitrary metadata (tags, load triggers, etc.) |
| `is_promoted` | boolean | Whether the memory is promoted to a constraint |
| `times_confirmed` / `times_contradicted` | integer | Confirmation tracking |
| `superseded_by` | uuid | Self-referencing FK for memory versioning |

#### `mjrvs_episodes` (128 rows)

Session-level records with full transcripts and evaluation data.

| Column | Type | Description |
|---|---|---|
| `session_id` | text | Unique session identifier |
| `summary` | text | Session summary |
| `outcome` | text | `successful`, `partial`, `failed`, `interrupted`, `exploratory` |
| `transcript_full` | jsonb | Complete conversation transcript |
| `duration_secs` | integer | Session duration |
| `turn_count` | integer | Number of conversation turns |
| `topics_discussed` | text | Topics covered |
| `decisions_made` | text | Decisions reached |
| `open_items` | text | Unresolved items |
| `tools_used` | text | Tools invoked |
| `evaluation_results` | jsonb | Quality evaluation data |
| `embedding` | vector | Session embedding |
| `consolidation_status` | text | `pending`, `processing`, `completed`, `failed` |

#### `mjrvs_conversations` (10,747 rows)

Individual conversation turns stored for retrieval and analysis.

| Column | Type | Description |
|---|---|---|
| `session_id` | text | Parent session |
| `turn_number` | integer | Turn sequence number |
| `role` | text | `operator`, `maya_jrvs`, or `panel_member` |
| `content` | text | Turn content |
| `embedding` | vector | Turn embedding |
| `caution_level_at_turn` | integer | Agent caution level at this turn |
| `time_in_call_secs` | float | Timestamp within the call |

#### `mjrvs_state` (1 row)

Persistent agent state that carries across sessions.

| Column | Type | Description |
|---|---|---|
| `caution_level` | integer (0–100) | Agent's current caution level |
| `trust_level` | integer (0–100) | Trust level with the operator |
| `formality_level` | integer (0–100) | Communication formality |
| `relationship_depth` | integer (0–100) | Relationship depth metric |
| `rupture_severity` | integer (0–3) | Current rupture severity |
| `operator_cognitive_load` | text | `low`, `nominal`, `high`, `overloaded` |
| `operator_emotional_valence` | text | `frustrated`, `urgent`, `neutral`, `engaged`, `flow` |
| `intervention_mode` | text | Current intervention strategy |
| `last_session_summary` | text | Summary of the most recent session |

#### `mjrvs_connections`

Graph of relationships between memories.

| Column | Type | Description |
|---|---|---|
| `source_memory_id` | uuid | FK to mjrvs_memories |
| `target_memory_id` | uuid | FK to mjrvs_memories |
| `connection_type` | text | `supports`, `contradicts`, `extends`, `replaces`, `derives_from`, `related_to`, `corrects` |
| `strength` | float (0.0–1.0) | Connection strength |

#### `mjrvs_rupture_log` (3 rows)

Records trust rupture events with recovery tracking.

| Column | Type | Description |
|---|---|---|
| `tier` | integer (1–3) | Rupture severity tier |
| `trigger_category` | text | `operator_harm`, `repeated_error`, `trust_violation`, `broken_promise`, `catastrophic_breach`, `other` |
| `recovery_phases_completed` | text[] | Phases completed in recovery |
| `caution_level_at_rupture` / `after` | integer | Before/after caution levels |

#### `mjrvs_documents` (240 rows) and `mjrvs_chunks` (6,360 rows)

Document ingestion and RAG (retrieval-augmented generation) system.

- `mjrvs_documents`: File metadata (path, hash, type, size, folder, owner scope, summary, summary embedding, full-text search vector).
- `mjrvs_chunks`: Document chunks with embeddings, headings, key paths, agent names, archetypes, and full-text search vectors.

#### `mjrvs_video_uploads` (51 rows)

Video and media file uploads with processing status tracking.

| Column | Type | Description |
|---|---|---|
| `media_url` | text | URL of the uploaded media |
| `upload_status` | text | `pending`, `processing`, `completed`, `failed` |
| `duration_seconds` | float | Media duration |
| `metadata` | jsonb | Additional metadata |

Related tables:
- `mjrvs_video_analyses` (19 rows) — analysis results with model used, tokens, processing time, confidence, embeddings.
- `mjrvs_video_tags` (90 rows) — extracted tags with categories (`general`, `object`, `person`, `scene`, `action`, `emotion`, `topic`) and optional timestamps.
- `mjrvs_video_chat_history` (10 rows) — chat messages about specific videos with optional web search results.

#### `mjrvs_tasks` (1 row)

Task tracking with status and priority.

| Column | Type | Description |
|---|---|---|
| `title` | text | Task title |
| `status` | text | `open`, `in_progress`, `blocked`, `done` |
| `priority` | text | `critical`, `high`, `medium`, `low` |
| `owner` | text | Assigned owner |
| `due_date` | date | Due date |

#### `mjrvs_reservoir`

Agent scoring system (score range: 200–1000).

#### `mjrvs_ingestion_queue` (34 rows)

Queue for document ingestion processing with retry tracking.

#### `mjrvs_debug_log` (256 rows)

Low-level debug logging for edge function requests.

#### `config_snapshots`

Stores historical agent configuration snapshots with embeddings for diff analysis.

### Edge Functions

The following Supabase Edge Functions are deployed to the PRMPT project and are used by the JRVS system:

| Function | Purpose |
|---|---|
| `mjrvs_summarize_session` | Session summarization pipeline (Claude + Voyage AI). Called by the dashboard at the 40-minute mark. |
| `mjrvs_memory` | CRUD operations on `mjrvs_memories` with semantic search via embeddings. |
| `mjrvs_state` | Read/write agent persistent state (`mjrvs_state` table). |
| `mjrvs_session` | Session lifecycle management. |
| `mjrvs_vision` | Video and image analysis (Gemini-based). |
| `mjrvs_llm` | LLM inference operations. |
| `mjrvs_tts` | Text-to-speech synthesis. |
| `mjrvs_post` | Post-session processing and data persistence. |
| `mjrvs_initial` | Session initialization and context loading. |
| `mjrvs_enrich` | Session enrichment and analysis. |
| `mjrvs_write_memory` | Direct memory write operations. |
| `mjrvs_task_write` | Task creation and updates. |
| `mjrvs_task_read` | Task retrieval. |
| `mjrvs_nightly_synthesis` | Scheduled nightly memory consolidation and synthesis. |
| `mjrvs_meta_synthesis` | Higher-order synthesis across sessions and memories. |

### Session Summarization Pipeline

The `mjrvs_summarize_session` edge function (source: `supabase/functions/mjrvs_summarize_session/index.ts`) implements the session handoff pipeline:

1. **Transcript Fetch**: Retrieves the full conversation transcript from ElevenLabs (`/v1/convai/conversations/{id}`).
2. **Formatting**: Converts raw transcript into speaker-labeled text ("Maya: ...", "Rami: ...").
3. **Summarization**: Sends the formatted transcript to Claude Opus 4.6 with a system prompt that instructs it to compress the conversation into a dense handoff summary preserving decisions, open items, technical facts, emotional state, corrections, and last topic.
4. **Embedding**: Generates a vector embedding of the summary using Voyage AI `voyage-4-large`.
5. **Storage**: Inserts the summary into `mjrvs_memories` with:
   - `category: "session_continuity"`
   - `confidence: "verified"`
   - `impact: "high"`
   - `importance: 0.90`
   - `source: "session_summarizer"`
   - `metadata`: Includes `tag: "session_handoff"`, `load_trigger: "session_start"`, source conversation ID, duration, and turn count.

**Deploy command**:
```bash
supabase functions deploy mjrvs_summarize_session --project-ref svqbfxdhpsmioaosuhkb
```

---

## Client Tools (Agent-to-Dashboard)

The ElevenLabs agent can invoke three client-side tools that execute in the dashboard:

### `display_structured_content`

Renders structured Markdown content in the transcript.

| Parameter | Type | Description |
|---|---|---|
| `content` | string (required) | Markdown content to display |
| `label` | string (optional) | Label shown above the content |

Returns `"displayed"` on success, `"missing_content"` if content is empty.

### `report_tool_dispatch`

Reports a server-side tool call to the dashboard's tool log and error log.

| Parameter | Type | Description |
|---|---|---|
| `tool_name` | string (required) | Name of the dispatched tool |
| `action` | string | Action description |
| `params` | string | Parameter summary |
| `result_summary` | string | Result summary |
| `status` | string | `success`, `error`, `failed`, `failure`, `tool_error` |
| `error_message` | string | Error message if status indicates failure |
| `error_code` | string | Error code |

If the result contains an `images` array, images are rendered inline in the transcript.
If the status indicates an error, the entry is also added to the error log.

### `report_active_node`

Updates the active workflow node indicator in the dashboard header.

| Parameter | Type | Description |
|---|---|---|
| `node_name` | string (required) | Name of the active node |
| `node_type` | string | Type of the node |

All client tool invocations are automatically wrapped with timing and error tracking via `wrapClientToolHandler`, which reports execution duration and error status back to the tool log.

---

## Session Flow

1. **Connect**: User clicks the phone icon. The dashboard fetches a signed URL from `/api/signed-url`, then starts a session via `useConversation.startSession()`.
2. **Conversation**: Voice/text exchange happens in real time. Transcript, tool calls, and errors are logged live.
3. **40-Minute Warning**: A countdown banner appears. The user can restart immediately or wait.
4. **Auto-Restart**: At countdown zero (or on manual restart):
   - `/api/mjrvs/summarize-session` is called to persist the session summary to `mjrvs_memories`.
   - The session disconnects.
   - A new session starts automatically via `newSessionSignal`.
   - A contextual update is sent on reconnect to restore context.
5. **Session History**: The ended session is cached in the history sidebar with its full transcript.
6. **Manual New Session**: Click "New Session" to start fresh (clears transcript, tool log, error log).

---

## Component Reference

| Component | File | Purpose |
|---|---|---|
| `ConversationBar` | `components/ui/conversation-bar.tsx` | Voice/text chat input with file attachments, mute, keyboard mode, connection management |
| `Message` / `MessageContent` | `components/ui/message.tsx` | Chat message layout primitives |
| `Response` | `components/ui/response.tsx` | Streaming Markdown rendering (streamdown + react-markdown) |
| `Mjrvs_structured_markdown_block` | `components/ui/mjrvs_structured_markdown_block.tsx` | Structured content with copy button |
| `Mjrvs_structured_content` | `components/ui/mjrvs_structured_content.tsx` | Structured content variant |
| `Mjrvs_config_inspector_panel` | `components/mjrvs_config_inspector_panel.tsx` | Full agent config inspector panel |
| `ConfigInspector` | `components/ui/config-inspector.tsx` | Legacy tabbed config inspector |
| `MicSelector` | `components/ui/mic-selector.tsx` | Microphone selection dropdown with live waveform |
| `LiveWaveform` | `components/ui/live-waveform.tsx` | Canvas-based audio waveform visualization |
| `SpeechInput` | `components/ui/speech-input.tsx` | ElevenLabs Scribe speech input compound component |
| `ShimmeringText` | `components/ui/shimmering-text.tsx` | Text shimmer animation |
| `Button`, `Card`, `Separator`, `Textarea`, `Avatar`, `DropdownMenu` | `components/ui/*.tsx` | shadcn/ui primitives (New York style) |

---

## Latency Analysis Tooling

The repository includes latency analysis tools for profiling ElevenLabs conversation performance:

- **`jrvs_v3_latency_analysis.py`**: Python script that analyzes ElevenLabs conversation latency data. Computes per-node and per-LLM breakdowns, TTFB histograms, outlier detection, and tool call frequency analysis.
- **`jrvs_v3_latency_raw.json`**: Raw latency data from 10 analyzed conversations.
- **`jrvs_v3_latency_summary.md`**: Generated report with:
  - Global LLM TTFB stats: Mean 2056ms, Median 1761ms, P95 4488ms.
  - Per-node breakdown across 5 workflow nodes.
  - Turn distribution (Qualification: 83%, Dr. Noir: 10%, VAG: 4%).
  - 131 outlier turns identified (TTFB > 3000ms).
  - TTS TTFB stats: Mean 389ms, Median 354ms.
  - Tool call analysis: 30% of turns use tools; `mjrvs_docs` (68), `google_search` (58), `maya_memory` (21) are most frequent.

---

## Scripts

### `scripts/mjrvs_agent_setup.sh`

Agent setup script for Cursor/CC sessions. Runs `npm install` and checks Node.js/npm versions. Should be executed at the start of every agent session:

```bash
bash scripts/mjrvs_agent_setup.sh
```

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 16.1.6 |
| Runtime | React | 19.2.3 |
| Language | TypeScript | ^5 |
| Styling | Tailwind CSS | ^4 |
| Component Library | shadcn/ui (New York) | — |
| Icons | Lucide React | ^0.575.0 |
| Animation | Motion | ^12.34.3 |
| Markdown | react-markdown + remark-gfm | ^10.1.0 / ^4.0.1 |
| Streaming Markdown | streamdown | ^2.3.0 |
| Voice AI | @elevenlabs/react | ^0.14.1 |
| Database | Supabase (PostgreSQL 17) | — |
| Edge Functions | Supabase Edge Functions (Deno) | — |
| Summarization | Anthropic Claude Opus 4.6 | — |
| Embeddings | Voyage AI voyage-4-large | — |

---

## Development Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm start        # Start production server
npm run lint     # Run ESLint
```

---

## Branch Protocol

Always commit and push directly to `main`. Do not create branches for JRVS work orders.
