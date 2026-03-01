# JRVS Dashboard

JRVS Dashboard is a Next.js app for interacting with a conversational ElevenLabs agent.  
It includes:

- Signed-URL based agent session startup (server-side key handling)
- Live transcript panel (user + AI markdown responses)
- Tool call log and error log side panels
- Header status bar (active node, conversation ID, connection/speaking state)

## Tech Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS + shadcn/ui
- ElevenLabs React SDK and ElevenLabs UI components

## Environment Variables

Create a `.env.local` (or configure these in Render):

```bash
ELEVENLABS_API_KEY=your_elevenlabs_api_key
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=your_agent_id
```

Important:

- `ELEVENLABS_API_KEY` is server-only (used in API routes)
- Never expose `ELEVENLABS_API_KEY` in client code

## Local Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Production Build

```bash
npm run build
npm start
```

## Deployment on Render

1. Create a new **Web Service** from this repo.
2. Use:
   - Build command: `npm run build`
   - Start command: `npm start`
   - Node version: `20+`
3. Add environment variables:
   - `ELEVENLABS_API_KEY`
   - `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`
4. Deploy.

## API Routes

- `GET /api/signed-url`  
  Retrieves a signed conversation URL from ElevenLabs using server-side API key.

- `GET /api/scribe-token` / `POST /api/scribe-token`  
  Retrieves a realtime Speech-to-Text token.

## Notes

- Tool-call visibility depends on what your agent emits in message/debug streams.
- Node transitions are inferred from agent messages/debug payloads; if none are exposed, header shows `Node: —`.
