import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  MessageSquare, X, BrainCircuit, Activity, 
  Terminal, Radio, Loader2, Settings2, 
  Shield, GraduationCap, Volume2, Unlink, MonitorUp, Lock, FileWarning, Bug, Cpu, AlertTriangle, ScreenShare
} from 'lucide-react';

import { TranscriptItem, MayaState, ErrorLogEntry } from './types';
import { 
  Message, MessageContent, 
  Conversation as ConversationUI, ConversationContent, ConversationEmptyState 
} from './Message';
import { RadarChart } from './RadarChart';
import { ControlDeck } from './components/ControlDeck';
import { useElevenLabs } from './hooks/useElevenLabs';
import { useSpeechToText } from './hooks/useSpeechToText';
import { useSystemAudio } from './hooks/useSystemAudio';
import { generateMayaResponse } from './services/gemini';

// INITIAL STATE
const INITIAL_MAYA_STATE: MayaState = {
  personality: { caution_level: 65, formality_level: 45, trust_level: 72, relationship_depth: 60 },
  cognitive_soma: { context_pressure: 0.1, synchrony: 0.0, verification_itch: 0.0, friction_load: 0.1, semantic_gravity: 0.5 },
  error_patterns: { padding_corrections: 0, character_contamination: 0, silent_substitutions: 0, verification_failures: 0 },
  memory_access_log: []
};

type SecurityLevel = 'safe' | 'caution' | 'critical';

/**
 * MayaOrb: A custom high-performance reactive visualizer.
 */
const MayaOrb: React.FC<{ volume: number; isRigid: boolean; isError?: boolean; themeColor?: string }> = ({ volume, isRigid, isError, themeColor = 'rgba(34, 211, 238, 0.3)' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: { angle: number; radius: number; speed: number; phase: number }[] = [];
    const particleCount = isRigid ? 12 : 64; 
    
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        angle: (i / particleCount) * Math.PI * 2,
        radius: 80 + Math.random() * 40,
        speed: 0.01 + Math.random() * 0.02,
        phase: Math.random() * Math.PI * 2
      });
    }

    const render = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      
      const centerX = width / 2;
      const centerY = height / 2;
      const baseRadius = 120 + (volume * 80); 
      
      ctx.beginPath();
      
      if (isError) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.lineWidth = 3;
      } else {
        ctx.strokeStyle = isRigid ? 'rgba(239, 68, 68, 0.4)' : themeColor;
        ctx.lineWidth = isRigid ? 2 : 0.5;
      }
      
      for (let i = 0; i < particleCount; i++) {
        const p = particles[i];
        p.phase += p.speed * (1 + volume * 5);
        const r = baseRadius + Math.sin(p.phase) * (20 + volume * 50);
        const x = centerX + Math.cos(p.angle) * r;
        const y = centerY + Math.sin(p.angle) * r;
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        
        const nextIdx = (i + 1) % particleCount;
        const pNext = particles[nextIdx];
        const rNext = baseRadius + Math.sin(pNext.phase) * (20 + volume * 50);
        const xNext = centerX + Math.cos(pNext.angle) * rNext;
        const yNext = centerY + Math.sin(pNext.angle) * rNext;
        
        ctx.lineTo(xNext, yNext);
      }
      ctx.closePath();
      ctx.stroke();

      if ((isRigid || isError) && Math.random() > 0.90) {
        ctx.fillStyle = isError ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.2)';
        ctx.fillRect(centerX - 150, centerY - 1, 300, 2);
      }

      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(requestRef.current);
  }, [volume, isRigid, isError, themeColor]);

  return (
    <canvas 
      ref={canvasRef} 
      width={600} 
      height={600} 
      className={`w-full h-full max-w-[500px] max-h-[500px] transition-opacity duration-700 ${isError ? 'opacity-100' : 'opacity-80'}`}
    />
  );
};

const App: React.FC = () => {
  // --- STATE ---
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showPersonality, setShowPersonality] = useState(false);
  const [showErrorLog, setShowErrorLog] = useState(false);
  const [wireGain, setWireGain] = useState(100);
  const [mayaState, setMayaState] = useState<MayaState>(INITIAL_MAYA_STATE);
  const [errorLog, setErrorLog] = useState<ErrorLogEntry[]>([]);
  const [securityLevel, setSecurityLevel] = useState<SecurityLevel>('safe');
  
  // Connection State
  const [systemOnline, setSystemOnline] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // --- AUDIO PIPELINE HOOKS ---
  const { speak, stop: stopSpeaking, isSpeaking, volume, engine: ttsEngine, setEngine: setTtsEngine, hasApiKey: hasElevenLabsKey } = useElevenLabs();

  // --- ERROR LOGGING ---
  const addError = useCallback((code: string, message: string, source: ErrorLogEntry['source']) => {
    setErrorLog(prev => [{
      id: Date.now().toString() + Math.random().toString(),
      timestamp: new Date(),
      code,
      message,
      source
    }, ...prev]);
  }, []);

  // --- SYSTEM BOOT CHECK ---
  useEffect(() => {
    // Check Env Vars on Mount
    if (!process.env.REACT_APP_GOOGLE_API_KEY && !process.env.REACT_APP_API_KEY) {
       addError("CONFIG_ERROR", "REACT_APP_GOOGLE_API_KEY is missing from .env", "SYSTEM");
    }
    if (!hasElevenLabsKey) {
       console.warn("SYSTEM: REACT_APP_ELEVENLABS_API_KEY missing. Audio output restricted to Native API.");
    }
  }, [addError, hasElevenLabsKey]);

  // --- CORE INTELLIGENCE LOOP ---
  const handleUserSpeech = useCallback(async (text: string, audioBase64?: string) => {
    if ((!text.trim() && !audioBase64) || isProcessing) return;
    
    setIsProcessing(true);
    
    // 1. Add User Message
    const userMsg: TranscriptItem = { 
      id: Date.now().toString(), 
      role: 'user', 
      text: audioBase64 ? "[SYSTEM AUDIO STREAM DATA]" : text, 
      timestamp: new Date(),
      metadata: { isAudio: !!audioBase64 }
    };
    setTranscript(prev => [...prev, userMsg]);

    try {
      // 2. Generate Gemini Response
      // Convert transcript to Gemini history format (text only for context)
      const history = transcript.map(t => ({ role: t.role, text: t.text }));
      const responseText = await generateMayaResponse(history, text, audioBase64);

      // 3. Add Agent Message
      const agentMsg: TranscriptItem = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: new Date()
      };
      setTranscript(prev => [...prev, agentMsg]);

      // 4. Speak Response (Raw API or Native)
      await speak(responseText);
    } catch (err: any) {
      addError("INTELLIGENCE_FAILURE", err.message || "Unknown Error", "SYSTEM");
    } finally {
      setIsProcessing(false);
    }
  }, [transcript, isProcessing, speak, addError]);

  // STT Hook
  const { isListening, startListening, stopListening, interimTranscript } = useSpeechToText(handleUserSpeech);

  // System Audio Hook
  const handleSystemAudioData = useCallback((base64: string) => {
     handleUserSpeech("Analyze this system audio stream.", base64);
  }, [handleUserSpeech]);

  const { isSharing, startSharing, stopSharing, systemVolume, isRecording: isSystemRecording } = useSystemAudio(handleSystemAudioData);

  // --- ORCHESTRATION LOOP ---
  // Manage Microphone vs Speaker state to prevent echo
  useEffect(() => {
    if (!systemOnline) return;

    if (isSpeaking || isProcessing) {
      if (isListening) stopListening();
    } else {
      // Only start mic if not sharing system audio to prevent confusion, or allow both?
      // Assuming separate streams, we can allow both, but Web Speech API often fights for focus.
      if (!isListening) startListening();
    }
  }, [systemOnline, isSpeaking, isProcessing, isListening, startListening, stopListening]);

  // --- SYSTEM TOGGLE ---
  const handleToggleSystem = () => {
    if (systemOnline) {
      stopListening();
      stopSpeaking();
      if (isSharing) stopSharing();
      setSystemOnline(false);
    } else {
      setSystemOnline(true);
      // Listening will start automatically via the Orchestration Loop useEffect
    }
  };

  // --- GLOBAL ERROR HANDLING ---
  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      addError("UNCAUGHT_EXCEPTION", event.message || "Unknown script error", 'SYSTEM');
    };
    window.addEventListener('error', handleGlobalError);
    return () => window.removeEventListener('error', handleGlobalError);
  }, [addError]);

  // --- THEME ---
  const theme = useMemo(() => {
    switch (securityLevel) {
      case 'caution':
        return { text: 'text-yellow-400', border: 'border-yellow-500', borderDim: 'border-yellow-900/40', orbColor: 'rgba(234, 179, 8, 0.4)', glow: 'phosphor-glow-yellow' };
      case 'critical':
        return { text: 'text-red-500', border: 'border-red-600', borderDim: 'border-red-900/60', orbColor: 'rgba(239, 68, 68, 0.6)', glow: 'red-phosphor-glow', animate: 'animate-pulse' };
      default:
        return { text: 'text-cyan-400', border: 'border-cyan-500', borderDim: 'border-cyan-900/40', orbColor: 'rgba(34, 211, 238, 0.3)', glow: 'phosphor-glow' };
    }
  }, [securityLevel]);

  const isRigid = mayaState.cognitive_soma.friction_load > 0.7;
  
  // Mixed volume for visualizer
  const displayVolume = Math.max(volume, systemVolume * 2);

  return (
    <div className={`flex flex-col h-screen bg-[#000000] font-mono overflow-hidden transition-colors duration-700 ${theme.text} selection:bg-cyan-500/30 border-[4px] ${securityLevel === 'safe' ? 'border-transparent' : theme.border} ${securityLevel === 'critical' ? 'animate-pulse' : ''}`}>
      
      {/* HEADER */}
      <header className={`flex items-center justify-between px-6 py-4 border-b ${theme.borderDim} bg-[#000000] z-30 relative transition-colors duration-500`}>
        <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setShowPersonality(!showPersonality)}>
          <div className={`p-2 bg-white/5 border border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-colors`}>
            {securityLevel === 'safe' ? <BrainCircuit className={`w-5 h-5 ${theme.text} ${theme.glow}`} /> : <Lock className={`w-5 h-5 ${theme.text} ${theme.glow}`} />}
          </div>
          <div className="flex flex-col">
            <h1 className={`text-sm font-bold tracking-[0.3em] ${theme.glow}`}>MAYA_JRVS</h1>
            <div className="flex gap-3 text-[9px] font-bold text-zinc-600 uppercase tracking-widest mt-0.5">
               <div className={`flex items-center gap-1 ${!systemOnline ? 'text-red-500' : 'text-green-500'}`}>
                 <Activity size={10} className={systemOnline ? 'animate-pulse' : ''} />
                 {systemOnline ? 'ONLINE' : 'OFFLINE'}
               </div>
               <div className={`flex items-center gap-1 ${systemOnline ? `${theme.text} ${theme.glow}` : 'text-zinc-700'}`}>
                 <Radio size={10} className={isSpeaking ? 'animate-pulse' : ''} />
                 WIRE: {isSpeaking ? "TX_ACTIVE" : isListening ? "RX_ACTIVE" : "IDLE"}
               </div>
               {/* ENGINE INDICATOR */}
               <div className={`flex items-center gap-1 ${systemOnline ? 'text-zinc-500' : 'text-zinc-800'}`}>
                 <Cpu size={10} />
                 MODE: {ttsEngine === 'ELEVEN_LABS' ? 'NEURAL' : 'NATIVE'}
               </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
           {/* SYSTEM AUDIO TOGGLE */}
           {systemOnline && (
             <button 
               onClick={isSharing ? stopSharing : startSharing}
               className={`px-3 py-2 text-[10px] font-bold border rounded-none transition-all flex items-center gap-2 uppercase tracking-wider ${
                 isSharing 
                   ? 'bg-red-900/20 text-red-400 border-red-500/30 animate-pulse' 
                   : 'bg-zinc-900 text-zinc-500 border-zinc-700'
               }`}
               title="Capture System Audio"
             >
               <ScreenShare size={14} />
               {isSharing ? 'SYS_LINK_ACTIVE' : 'LINK_SYS_AUDIO'}
             </button>
           )}

           {/* ENGINE TOGGLE - Disabled if no Key */}
           <button 
             onClick={() => hasElevenLabsKey && setTtsEngine(prev => prev === 'ELEVEN_LABS' ? 'WEB_NATIVE' : 'ELEVEN_LABS')}
             disabled={!hasElevenLabsKey}
             className={`px-3 py-2 text-[10px] font-bold border rounded-none transition-all flex items-center gap-2 uppercase tracking-wider ${
               ttsEngine === 'ELEVEN_LABS' 
                 ? 'bg-cyan-900/20 text-cyan-400 border-cyan-500/30' 
                 : !hasElevenLabsKey 
                    ? 'bg-red-900/10 text-red-800 border-red-900/20 cursor-not-allowed'
                    : 'bg-zinc-900 text-zinc-500 border-zinc-700'
             }`}
             title={hasElevenLabsKey ? "Toggle Speech Engine" : "ElevenLabs API Key Missing"}
           >
             {!hasElevenLabsKey && <AlertTriangle size={10} />}
             {ttsEngine === 'ELEVEN_LABS' ? '11.LABS' : 'WEB.API'}
           </button>

           <button onClick={() => setShowErrorLog(!showErrorLog)} className={`p-2.5 transition-all border rounded-none flex items-center gap-2 ${showErrorLog || errorLog.length > 0 ? 'text-red-400 border-red-900/50 bg-red-950/10 animate-pulse' : 'text-zinc-700 bg-white/5 border-transparent hover:text-zinc-500'}`}><FileWarning size={16} /></button>
          <button onClick={() => setShowTranscript(!showTranscript)} className={`p-2.5 transition-all border rounded-none ${showTranscript ? `${theme.text} bg-white/5 border-white/10 ${theme.glow}` : 'text-zinc-700 bg-white/5 border-transparent hover:text-zinc-500'}`}><MessageSquare size={18} /></button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* Error Log */}
        <div className={`fixed inset-x-0 bottom-0 top-[73px] bg-black/95 backdrop-blur-md z-50 transition-transform duration-500 ${showErrorLog ? 'translate-y-0' : 'translate-y-[120%]'} flex flex-col p-8 border-t-2 border-red-900 shadow-[0_-5px_30px_rgba(239,68,68,0.15)]`}>
          <div className="flex justify-between items-center mb-6 border-b border-red-900/30 pb-4">
             <div className="flex items-center gap-3"><div className="p-2 bg-red-500/10 border border-red-500/20 rounded-none animate-pulse"><Bug className="text-red-500" size={20} /></div><div className="flex flex-col"><h2 className="text-red-500 text-sm font-bold uppercase tracking-[0.2em] font-mono">System Diagnostics Log</h2></div></div>
             <button onClick={() => setShowErrorLog(false)} className="text-zinc-600 hover:text-red-500 transition-colors p-2"><X size={24} /></button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar font-mono text-xs space-y-1">
             {errorLog.map(log => (<div key={log.id} className="grid grid-cols-[110px_100px_180px_1fr] gap-4 p-3 border-l-2 border-red-900/30 bg-red-950/5"><span className="text-zinc-500">{log.timestamp.toLocaleTimeString()}</span><span className="font-bold text-cyan-600">{log.source}</span><span className="text-red-400 font-bold">{log.code}</span><span className="text-zinc-400">{log.message}</span></div>))}
          </div>
        </div>

        {/* Personality Aside */}
        <aside className={`fixed inset-y-0 left-0 w-[320px] bg-black border-r ${theme.borderDim} transition-transform duration-500 ${showPersonality ? 'translate-x-0' : '-translate-x-full'} z-20 flex flex-col mt-[73px]`}>
          <div className="p-6 border-b border-zinc-900 bg-black flex items-center justify-between"><div className="flex items-center gap-3 font-mono"><Settings2 className={`w-4 h-4 ${theme.text} ${theme.glow}`} /><h3 className="font-bold uppercase tracking-[0.2em] text-[10px] text-zinc-500">PARAM_MONITOR</h3></div><button onClick={() => setShowPersonality(false)} className={`text-zinc-700 hover:${theme.text} transition-colors`}><X size={14} /></button></div>
          <div className="flex-1 p-6 space-y-8 overflow-y-auto custom-scrollbar">
            <div className="space-y-3"><RadarChart data={{ caution: mayaState.personality.caution_level, formality: mayaState.personality.formality_level, trust: mayaState.personality.trust_level, depth: mayaState.personality.relationship_depth }} /></div>
            <PersonalitySlider label="Caution" icon={<Shield size={14} />} value={mayaState.personality.caution_level} onChange={val => setMayaState(p => ({...p, personality: {...p.personality, caution_level: val}}))} theme={theme} />
            <PersonalitySlider label="Formality" icon={<GraduationCap size={14} />} value={mayaState.personality.formality_level} onChange={val => setMayaState(p => ({...p, personality: {...p.personality, formality_level: val}}))} theme={theme} />
             <div className="p-4 bg-white/5 border border-white/10 rounded-none space-y-4">
               <div className="flex items-center justify-between">
                 <div className={`flex items-center gap-2 ${theme.text} ${theme.glow}`}><Volume2 size={14} /><span className="text-[10px] font-bold uppercase tracking-widest">PROP_GAIN</span></div>
                 <span className={`text-[10px] font-mono ${theme.text} ${theme.glow}`}>{wireGain}%</span>
               </div>
               <input type="range" min="0" max="200" value={wireGain} onChange={e => setWireGain(parseInt(e.target.value))} className={`w-full h-1 bg-zinc-900 appearance-none cursor-pointer accent-current ${theme.text}`} />
            </div>
          </div>
        </aside>

        {/* Main View */}
        <div className={`flex-1 flex flex-col items-center justify-center transition-all duration-500 relative ${showTranscript ? 'lg:pr-[440px]' : ''} ${showPersonality ? 'lg:pl-[320px]' : ''}`}>
          
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none px-20 z-0">
            <div className={`flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.2em] leading-loose text-zinc-500 border-r-2 ${theme.borderDim} pr-3 transition-colors duration-500`}>
               <div>0x8F9A | SYS.FRC_LOAD :: [{mayaState.cognitive_soma.friction_load.toFixed(2)}]</div>
               <div className={isSpeaking ? theme.text : "opacity-30"}>SIGNAL_VOL :: {(displayVolume * 100).toFixed(1)}%</div>
            </div>
            <div className={`flex flex-col gap-1 font-mono text-[10px] uppercase tracking-[0.2em] leading-loose text-zinc-500 border-l-2 ${theme.borderDim} pl-3 text-right transition-colors duration-500`}>
               <div className={systemOnline ? "text-green-600" : "text-red-500"}>CORE :: {systemOnline ? "GEMINI_BRIDGE_ACTIVE" : "OFFLINE"}</div>
               <div>VOX :: {ttsEngine === 'ELEVEN_LABS' ? 'ELEVENLABS_V2.5' : 'WEB_NATIVE_API'}</div>
               {isProcessing && <div className="text-cyan-400 animate-pulse">>> INFERENCE_ACTIVE</div>}
               {isSharing && (
                  <div className={`flex items-center justify-end gap-1 ${isSystemRecording ? 'text-red-500' : 'text-zinc-500'}`}>
                    <ScreenShare size={10} />
                    {isSystemRecording ? 'SYS_AUDIO_INGEST_ACTIVE' : 'SYS_AUDIO_MONITORING'}
                  </div>
               )}
            </div>
          </div>

          <div className="flex items-center justify-center relative z-10 scale-[1.2] mb-12">
            <MayaOrb volume={displayVolume} isRigid={isRigid} themeColor={theme.orbColor} />
            {isListening && interimTranscript && (
               <div className="absolute top-full mt-8 text-center max-w-md">
                 <p className="text-zinc-500 text-xs font-mono animate-pulse">{interimTranscript}</p>
               </div>
            )}
            {isProcessing && (
               <div className="absolute top-full mt-8 flex items-center gap-2">
                 <Loader2 className={`animate-spin ${theme.text}`} size={16} />
                 <span className={`text-[10px] font-bold uppercase tracking-widest ${theme.text}`}>PROCESSING_NEURAL_PATH...</span>
               </div>
            )}
          </div>

          <div className="fixed bottom-12 z-40 w-full max-w-md px-4">
             <div className="flex flex-col gap-2 items-center">
                 <button 
                  onClick={handleToggleSystem}
                  className={`w-full bg-black border ${theme.border} ${theme.text} px-8 py-3 text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-white/5 ${theme.glow} shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-all flex items-center justify-center gap-2`}
                 >
                   {systemOnline ? <Unlink size={12} /> : <Activity size={12} />}
                   {systemOnline ? "SEVER_UPLINK" : "ESTABLISH_UPLINK"}
                 </button>
                 
                 {systemOnline && (
                   <ControlDeck 
                     isSpeaking={isSpeaking}
                     isListening={isListening}
                     onSendMessage={handleUserSpeech}
                   />
                 )}
             </div>
          </div>
        </div>

        {/* Transcript Aside */}
        <aside className={`fixed inset-y-0 right-0 w-[440px] bg-black border-l ${theme.borderDim} transition-transform duration-500 ${showTranscript ? 'translate-x-0' : 'translate-x-full'} z-20 flex flex-col`}>
          <ConversationUI className="h-full">
            <div className="p-6 border-b border-zinc-900 flex justify-between items-center bg-black">
              <div className="flex items-center gap-3 font-mono"><Terminal className={`w-4 h-4 ${theme.text} ${theme.glow}`} /><h3 className="font-bold uppercase tracking-[0.2em] text-[10px] text-zinc-500">NEURAL_FEED</h3></div>
              <button onClick={() => setShowTranscript(false)} className="p-2 hover:bg-zinc-900 transition-colors border border-transparent hover:border-zinc-800 text-zinc-500"><X size={20} /></button>
            </div>
            <ConversationContent className="bg-black/50">
              {transcript.length === 0 && <ConversationEmptyState />}
              {transcript.map(item => (
                <Message key={item.id} from={item.role === 'user' ? 'user' : 'assistant'} timestamp={item.timestamp}>
                  <MessageContent from={item.role === 'user' ? 'user' : 'assistant'}>{item.text}</MessageContent>
                </Message>
              ))}
            </ConversationContent>
          </ConversationUI>
        </aside>
      </main>
    </div>
  );
};

const PersonalitySlider: React.FC<{ label: string; icon: React.ReactNode; value: number; onChange: (val: number) => void; theme: any }> = ({ label, icon, value, onChange, theme }) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className={`p-1.5 rounded-none bg-white/5 ${theme.text} border border-white/10 shadow-[0_0_8px_rgba(255,255,255,0.05)]`}>{icon}</div>
        <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">{label}</span>
      </div>
      <span className={`text-[10px] font-mono font-bold ${theme.text} bg-white/5 px-2 py-0.5 border border-white/10 ${theme.glow}`}>{value.toFixed(0)}%</span>
    </div>
    <input type="range" min="0" max="100" value={value} onChange={e => onChange(parseInt(e.target.value))} className={`w-full h-1 bg-zinc-900 appearance-none cursor-pointer accent-current ${theme.text}`} />
  </div>
);

export default App;