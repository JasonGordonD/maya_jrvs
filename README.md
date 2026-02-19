# Maya JRVS v3.0

Browser-based executive AI assistant with a warm, frosted-glass interface and an edge-routed multi-provider LLM backend.

**Agent name:** JVRS
**Agent ID:** `agent_0401khmtcyfef6hbpcvchjv5jj02`

## What is in this repo

- **Frontend**: React 19 + Vite 6 (single runtime tree at repo root)
- **LLM client bridge**: `services/gemini.ts` (frontend -> Supabase Edge Function)
- **Edge function**: `supabase/functions/mjrvs_llm/index.ts` (provider router)
- **Voice**: `useConversation` from `@elevenlabs/react` (connects to live ElevenLabs Conversational AI agent)
- **Widget**: `widget.html` (standalone embeddable widget via CDN)
- **Orb**: `Orb.tsx` (canvas-based voice visualization that reacts to audio volume)

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

### Voice agent

The voice agent connects to ElevenLabs Conversational AI via WebRTC (recommended, lower latency) or WebSocket. The connection is managed by the `@elevenlabs/react` SDK's `useConversation` hook.

```text
Browser (React)
    ↓ useConversation({ agentId, connectionType: "webrtc" })
ElevenLabs Conversational AI
    ↓
JVRS Agent (agent_0401khmtcyfef6hbpcvchjv5jj02)
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

## ElevenLabs Integration Methods

### 1. React SDK (primary — this repo)

The main application uses `@elevenlabs/react` with the `useConversation` hook:

```tsx
import { useConversation } from "@elevenlabs/react";

const conversation = useConversation({
  onConnect: () => console.log("Connected"),
  onDisconnect: () => console.log("Disconnected"),
  onMessage: (message) => console.log("Message:", message),
  onError: (error) => console.error("Error:", error),
  onModeChange: (mode) => console.log("Mode:", mode),
});

await conversation.startSession({
  agentId: "agent_0401khmtcyfef6hbpcvchjv5jj02",
  connectionType: "webrtc",
});
```

Key SDK features used in this project:
- `conversation.sendUserMessage(text)` — send text to the agent
- `conversation.sendContextualUpdate(text)` — inject context without triggering a response
- `conversation.sendFeedback(true/false)` — per-message quality feedback
- `conversation.sendUserActivity()` — signal activity to prevent interruptions
- `conversation.getInputVolume()` / `getOutputVolume()` — audio level monitoring for the Orb visualization
- `conversation.changeInputDevice(...)` — runtime microphone switching

### 2. Embeddable Widget (`widget.html`)

A standalone HTML page using the ElevenLabs CDN widget. No build step required:

```html
<script src="https://elevenlabs.io/convai-widget/index.js" async></script>
<elevenlabs-convai agent-id="agent_0401khmtcyfef6hbpcvchjv5jj02"></elevenlabs-convai>
```

Access at `/widget.html` in development or production.

### 3. Direct WebSocket

For custom integrations:

```
wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_0401khmtcyfef6hbpcvchjv5jj02
```

### 4. WebRTC with server-side token

For production deployments requiring authentication:

```js
// Server-side: obtain a conversation token
const response = await fetch(
  "https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=agent_0401khmtcyfef6hbpcvchjv5jj02",
  { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY } }
);
const { token } = await response.json();

// Client-side: use token
await conversation.startSession({
  conversationToken: token,
  connectionType: "webrtc",
});
```

### 5. Python SDK

```bash
pip install "elevenlabs[pyaudio]"
```

```python
from elevenlabs.client import ElevenLabs
from elevenlabs.conversational_ai.conversation import Conversation
from elevenlabs.conversational_ai.default_audio_interface import DefaultAudioInterface

client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY"))
conversation = Conversation(
    client,
    agent_id="agent_0401khmtcyfef6hbpcvchjv5jj02",
    requires_auth=False,
    audio_interface=DefaultAudioInterface(),
    callback_agent_response=lambda response: print(f"Agent: {response}"),
    callback_user_transcript=lambda transcript: print(f"User: {transcript}"),
)
conversation.start_session()
```

## Security posture

- Browser no longer calls LLM providers directly.
- Browser no longer sends provider API keys.
- Provider keys are read in edge runtime via `Deno.env.get(...)`.
- Frontend defaults to `https://svqbfxdhpsmioaosuhkb.supabase.co` if `VITE_SUPABASE_URL` is not set. A publishable key (`VITE_SUPABASE_KEY` or `VITE_SUPABASE_ANON_KEY`) is optional when target Edge Functions run with JWT verification disabled.

## Supported models

- `gemini-3-flash-preview`
- `gemini-2.5-flash`
- `gemini-3-pro-preview`
- `claude-opus-4-6`
- `claude-sonnet-4-5-20250929`
- `claude-haiku-4-5-20251001`
- `grok-4-1-fast`
- `mistral-large-2512`
- `mistral-medium-2508`
- `magistral-medium-2509`

## UI design system

Current frontend uses a neon-pink accent palette and frosted surfaces:

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
  - canvas-based Orb visualization reacting to audio volume

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

Compatibility: `VITE_SUPABASE_ANON_KEY` is also accepted as the key variable.
If your Edge Functions are deployed with `--no-verify-jwt`, the key can be omitted.

Optional:

```env
VITE_ELEVENLABS_AGENT_ID=agent_0401khmtcyfef6hbpcvchjv5jj02
```

If `VITE_ELEVENLABS_AGENT_ID` is not set, the app defaults to the production JVRS agent ID.

### 3) Edge secrets (Supabase project)

Set in Supabase Edge Function secrets:

- `GEMINI_API_KEY`
- `ANTHROPIC_API_KEY`
- `XAI_API_KEY`
- `MISTRAL_API_KEY`
- `ELEVENLABS_API_KEY` (required for `mjrvs_tts` neural voice proxy)

### 4) Run

```bash
npm run dev
```

Dev server: `http://localhost:3001`

Widget: `http://localhost:3001/widget.html`

## Deployment

### Static hosting (Render, Vercel, Netlify, etc.)

```bash
npm run build
```

Serve the `dist/` directory. Both `index.html` (full React app) and `widget.html` (lightweight CDN widget) are included in the build output.

### Docker

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

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

## Documentation & API Reference

- Full documentation: https://elevenlabs.io/docs/eleven-agents
- API reference: https://elevenlabs.io/docs/api-reference/introduction
- Agents API: https://elevenlabs.io/docs/api-reference/agents/get
- Conversations API: https://elevenlabs.io/docs/api-reference/conversations/get

## License

Proprietary - PRMPT / Maya JRVS Internal
