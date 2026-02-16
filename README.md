# Maya JRVS - Personality Architecture

A high-fidelity, real-time voice-first AI executive orchestrator with adjustable personality parameters and cognitive state visualization.

## Features

- Real-time voice interaction via ElevenLabs Conversational AI
- Adjustable personality parameters (caution, formality, trust, depth)
- Cognitive soma drivers (friction, pressure, semantic gravity)
- Reactive canvas-based "orb" visualizer
- Live transcript and error logging

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env.local` and add your API keys:
```bash
cp .env.example .env.local
```

3. Get your ElevenLabs API key and Agent ID from https://elevenlabs.io
4. Add to `.env.local`:
```
ELEVENLABS_API_KEY=your_key_here
ELEVENLABS_AGENT_ID=your_agent_id_here
```

5. Run locally:
```bash
npm run dev
```

## Required API Keys

- `ELEVENLABS_API_KEY` (required) - For voice AI agent
- `ELEVENLABS_AGENT_ID` (required) - Your conversational AI agent ID

## License

[Add your license here]
