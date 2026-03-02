# JRVS Dashboard

Maya AI assistant interface — voice and text conversation dashboard powered by ElevenLabs.

## Agent Setup (CC/Cursor)

Run `bash scripts/mjrvs_agent_setup.sh` at the start of every agent session.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production Build

```bash
npm run build
npm start
```

## Environment Variables

Create a `.env.local` for local development. Required variables (names only):

| Variable | Description |
|---|---|
| `MJRVS_ELEVENLABS_AGENT_ID` | JRVS agent ID (canonical) |
| `ELEVENLABS_API_KEY` | ElevenLabs API key (server-only) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` | Agent ID exposed to client (legacy) |

Server routes also read compatibility aliases: `ELEVEN_LABS_API_KEY`, `VITE_ELEVENLABS_API_KEY`, `VITE_ELEVENLABS_AGENT_ID`.

## Key Features

- **Voice mode** — real-time voice conversation with the agent via ElevenLabs SDK
- **Text mode** — chat-style text conversation with file attachment support
- **File upload** — attach PDF, text, markdown, JSON, CSV, and image files
- **Session auto-restart** — sessions automatically restart at 40 minutes to preserve context
- **Live transcript** — searchable, downloadable transcript with per-message copy
- **Tool call log** — real-time log of all agent tool dispatches
- **Error log** — categorized error display with severity indicators
- **Session history** — browse and review past session transcripts

## Tech Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS + shadcn/ui
- ElevenLabs React SDK

## API Routes

- `GET /api/signed-url` — server-side signed URL for agent sessions
- `GET|POST /api/scribe-token` — realtime speech-to-text token
- `GET|POST /api/agent-config` — agent configuration snapshot
- `POST /api/mjrvs/summarize-session` — session summary via Supabase edge function

## Branch Protocol

Always commit to `main`. Do not create feature branches.
