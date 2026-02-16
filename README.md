# Maya JRVS v3.0

Browser-based executive AI assistant with a warm, frosted-glass interface and an edge-routed multi-provider LLM backend.

## What is in this repo

- **Frontend**: React 19 + Vite 6 (single runtime tree at repo root)
- **LLM client bridge**: `services/gemini.ts` (frontend -> Supabase Edge Function)
- **Edge function**: `supabase/functions/mjrvs_llm/index.ts` (provider router)
- **Voice hooks**:
  - `hooks/useElevenLabs.ts` (browser -> proxy endpoint for TTS)
  - `hooks/useSpeechToText.ts` (browser -> proxy websocket for realtime STT)

## Architecture

```text
React UI (localhost:3001)
    ↓
services/gemini.ts
    ↓
Supabase Edge Function: mjrvs_llm
    ↓
Provider routing by model prefix
    ├─ gemini-*      -> Google
    ├─ claude-*      -> Anthropic
    ├─ grok-*        -> xAI
    └─ mistral-*     -> Mistral
```

### LLM routing (implemented)

The edge function expects:

```json
{
  "action": "chat",
  "model": "gemini-3-flash-preview",
  "system_prompt": "...",
  "messages": [{ "role": "user", "content": "..." }],
  "temperature": 0.7
}
```

Unified response:

```json
{
  "content": "...",
  "model": "gemini-3-flash-preview",
  "provider": "google",
  "tokens": 847
}
```

## Security posture

- Browser no longer calls LLM providers directly.
- Browser no longer sends provider API keys.
- Provider keys are read in edge runtime via `Deno.env.get(...)`.
- Frontend only uses publishable Supabase config (`VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`).

## Supported models

- `gemini-3-flash-preview`
- `gemini-3-pro-preview`
- `claude-opus-4-6`
- `claude-sonnet-4-5-20250929`
- `claude-haiku-4-5-20251001`
- `grok-4`
- `grok-4-heavy`
- `mistral-large-2512`
- `mistral-medium-2508`
- `magistral-medium-2509`

## UI design system

Current frontend uses a warm copper palette and frosted surfaces:

- Tokens in `index.css`:
  - `--bg-void`, `--bg-surface`, `--bg-elevated`, `--bg-panel`
  - `--accent-warm`, `--accent-warm-dim`
  - text/border tokens
- Typography:
  - **DM Sans** (UI + conversation)
  - **IBM Plex Mono** (system labels, metadata, status)
- Includes:
  - film grain overlay
  - subtle top-left ambient radial glow
  - telemetry bar
  - model selector with provider dot + latency
  - collapsible context sidebar
  - token metadata lines on assistant responses

## Local development

### 1) Install

```bash
npm install
```

### 2) Frontend env (`.env.local`)

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_KEY=<supabase-anon-key>
```

Optional:

```env
VITE_STT_PROXY_WS_URL=wss://<your-stt-proxy>
VITE_ELEVENLABS_AUTO_MODE=false
VITE_ELEVENLABS_VOICE_ID=<non-secret-id>
VITE_ELEVENLABS_OUTPUT_FORMAT=mp3_44100_64
VITE_ELEVENLABS_MODEL_ID=eleven_v3
```

### 3) Edge secrets (Supabase project)

Set in Supabase Edge Function secrets:

- `GEMINI_API_KEY`
- `ANTHROPIC_API_KEY`
- `XAI_API_KEY`
- `MISTRAL_API_KEY`
- `FRONTEND_ORIGIN` (optional, defaults to `http://localhost:3001`)

### 4) Run

```bash
npm run dev
```

Dev server: `http://localhost:3001`

## Scripts

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npx tsc --noEmit`

## Validation checklist

```bash
npx tsc --noEmit
npm run build
```

## License

Proprietary - PRMPT / Maya JRVS Internal
