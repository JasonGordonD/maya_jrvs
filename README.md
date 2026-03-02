# JRVS Dashboard (Maya AI Assistant)

JRVS Dashboard is the Next.js interface for Maya, the JRVS assistant.  
It supports live voice/text conversations, transcript review, and operational logs.

## Agent Setup (CC/Cursor)
Run `bash scripts/mjrvs_agent_setup.sh` at the start of every agent session.

## Run Locally
1. `npm install`
2. `npm run dev`
3. Open `http://localhost:3000`

## Environment Variables
Required:
- `MJRVS_ELEVENLABS_AGENT_ID`
- `ELEVENLABS_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`

Also present in codebase:
- `ELEVEN_LABS_API_KEY`
- `VITE_ELEVENLABS_API_KEY`

## Key Features
- Voice mode and text mode session control
- File upload support in text chat mode
- Tool call log and error log visibility
- Session history and transcript search/export
- Automatic session restart at 40 minutes (with warning countdown)

## Useful Commands
- `npm run lint`
- `npm run build`
- `npm start`

## Branch Protocol
Always commit and push directly to `main`. Do not create branches for JRVS work orders.
