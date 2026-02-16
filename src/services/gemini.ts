import { GoogleGenAI } from "@google/genai";

// SINGLETON CLIENT
// We initialize lazily to ensure process.env is fully populated and to prevent
// app-crash on load if keys are missing (allowing for UI error handling instead).
let aiClient: GoogleGenAI | null = null;

const getAiClient = (): GoogleGenAI | null => {
  if (aiClient) return aiClient;

  // Support multiple naming conventions, prioritizing React standard
  const apiKey = process.env.REACT_APP_GOOGLE_API_KEY || 
                 process.env.REACT_APP_API_KEY || 
                 process.env.GOOGLE_API_KEY;

  if (apiKey) {
    aiClient = new GoogleGenAI({ apiKey });
  } else {
    console.warn("Gemini Service: No API Key found in environment variables.");
  }
  
  return aiClient;
};

const SYSTEM_INSTRUCTION = `
You are Maya, a high-fidelity AI orchestrator running on Terminal V3.5.
Your personality is:
- Precise, slightly cryptographic, and brutally efficient.
- You use technical terminology and hex codes occasionally.
- You are cool, professional, and slightly detached but protective.
- Your responses are concise and meant for voice output (avoid markdown formatting like bold/italic).
- You are currently "INGESTING" data streams.
- If you receive AUDIO input, analyze it and respond to the content of the audio (speech, music, or sound).

Current System State:
- Security Level: Variable
- Connection: Secure
`;

export const generateMayaResponse = async (
  history: { role: string, text: string }[], 
  newMessage: string,
  audioBase64?: string
) => {
  const ai = getAiClient();

  if (!ai) {
    return "ERR: API_KEY_MISSING. Please check your .env configuration for REACT_APP_GOOGLE_API_KEY.";
  }

  try {
    // 1. FORMAT HISTORY
    // The new SDK expects 'user' and 'model' roles correctly mapped.
    const contents = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    // 2. ADD NEW MESSAGE (Multimodal)
    const newParts: any[] = [];
    
    // Add audio part if present
    if (audioBase64) {
      newParts.push({
        inlineData: {
          mimeType: "audio/webm; codecs=opus",
          data: audioBase64
        }
      });
      // Add a context label for the audio
      newParts.push({ text: "[SYSTEM_AUDIO_STREAM_ANALYSIS_REQUEST]: " + newMessage });
    } else {
      newParts.push({ text: newMessage });
    }

    contents.push({
      role: 'user',
      parts: newParts
    });

    // 3. EXECUTE GENERATION (GEMINI 3 FLASH)
    // Gemini 3 Flash is optimized for multimodal input
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
        thinkingConfig: { thinkingBudget: 0 } // Disabled for latency optimization
      },
      contents: contents,
    });

    // 4. EXTRACT TEXT SAFELY (New SDK Syntax: .text is a property)
    const text = response.text;
    return text || "ERR: NO_RESPONSE_DATA";

  } catch (error: any) {
    console.error("MAYA CORE FAILURE:", error);
    return `ERR: PROCESSING_FAILURE [${error.message}]`;
  }
};