# Maya JRVS v3.5 - Executive Orchestrator

Real-time voice-first AI executive orchestrator with adjustable personality architecture, cognitive state visualization, and direct Gemini 3 Flash integration.

## Current Status

**✓ SYSTEM PROMPT FIX DEPLOYED**
- Maya's v3.0 personality prompt now correctly loads at model initialization level
- Fixed: `systemInstruction` moved from `config` object to model-level parameter
- Using Google Gemini 3 Flash Preview (non-deprecated, stable until March 2026)
- Debug logging enabled to verify prompt delivery

## Architecture

```
Browser UI (React + Vite)
    ↓
services/gemini.ts
    ↓
Google GenAI SDK
    ↓
Gemini 3 Flash Preview API
```

**Key File:** `/services/gemini.ts`
- **Lines 10-26**: Maya v3.0 system prompt (exported as `SYSTEM_INSTRUCTION`)
- **Line 54**: System prompt injected at model level: `systemInstruction: SYSTEM_INSTRUCTION`
- **Line 36**: Debug log proves prompt is loaded before each API call

## Features

- **Voice Interaction**: ElevenLabs Conversational AI integration
- **Personality Architecture**: Adjustable parameters (caution, formality, trust, relationship depth)
- **Cognitive Soma**: Real-time visualization of context pressure, synchrony, friction load
- **Canvas Orb**: Reactive visualizer with gyroscopic rings and energy field
- **System Prompt Delivery**: Verified v3.0 Maya personality architecture

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env.local
```

Add to `.env.local`:
```env
VITE_GOOGLE_API_KEY=your_gemini_api_key
VITE_ELEVENLABS_API_KEY=your_elevenlabs_key
VITE_ELEVENLABS_AGENT_ID=your_agent_id
```

### 3. Run Development Server
```bash
npm run dev
```

Server runs at: http://localhost:3000

## Verification

### Test System Prompt Delivery

1. Open http://localhost:3000
2. Open browser console (F12)
3. Send test message: "hey Maya what's up"
4. Look for console logs:
   ```
   SYSTEM PROMPT LOADED: I'm Maya. Senior advisor, systems architect, executive orchestrator for PRMPT...
   Maya response (first 100 chars): [Maya's response in her voice]
   ```

### Expected Behavior

Maya should respond with:
- ✓ Direct, structured prose
- ✓ No emoji (unless explicitly requested)
- ✓ No padding/filler words
- ✓ "Done." "Struck." "Agreed." style confirmations
- ✗ NOT generic Gemini responses with emoji/casual language

## Tech Stack

- **Frontend**: React 19 + Vite 6
- **LLM**: Google Gemini 3 Flash Preview (via `@google/genai` SDK)
- **Voice**: ElevenLabs Conversational AI V3
- **Styling**: Tailwind CSS + Custom holographic UI
- **Visualization**: Canvas API (MayaOrb component)

## Known Issues

- Model selector UI present but not wired (future: multi-provider LLM router)
- Vision upload UI present but not wired to Gemini vision API
- Scrolling fixed, transcript panel works correctly

## Next Steps

1. ✓ Verify system prompt delivery (PRIORITY)
2. Deploy mjrvs_llm edge function (multi-provider LLM router)
3. Wire model selector dropdown to edge function
4. Enable vision file upload to Gemini vision API
5. Deploy to production

## License

Proprietary - PRMPT/Maya JRVS Internal
