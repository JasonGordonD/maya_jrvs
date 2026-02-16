import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  MessageSquare, X, BrainCircuit, Activity,
  Terminal, Radio, Loader2, Settings2,
  Shield, GraduationCap, Volume2, Unlink, MonitorUp, Lock, FileWarning, Bug, Cpu, TestTube, Image, Upload, Send, Mic
} from 'lucide-react';

import { TranscriptItem, MayaState, ErrorLogEntry } from './types';
import {
  Message, MessageContent,
  Conversation as ConversationUI, ConversationContent, ConversationEmptyState, ConversationScrollButton
} from './Message';
import { RadarChart } from './RadarChart';
import { ControlDeck } from './components/ControlDeck';
import { useElevenLabs } from './hooks/useElevenLabs';
import { useSpeechToText } from './hooks/useSpeechToText';
import { generateMayaResponse } from './services/gemini';
import GlassPanel from './GlassPanel';
import TactileButton from './TactileButton';
import { ComponentShowcase } from './ComponentShowcase';
import { Response } from './Response';
import { MicSelector } from './MicSelector';
import { FileUpload } from './FileUpload';

// INITIAL STATE
const INITIAL_MAYA_STATE: MayaState = {
  personality: { caution_level: 65, formality_level: 45, trust_level: 72, relationship_depth: 60 },
  cognitive_soma: { context_pressure: 0.1, synchrony: 0.0, verification_itch: 0.0, friction_load: 0.1, semantic_gravity: 0.5 },
  error_patterns: { padding_corrections: 0, character_contamination: 0, silent_substitutions: 0, verification_failures: 0 },
  memory_access_log: []
};

type SecurityLevel = 'safe' | 'caution' | 'critical';

/**
 * MayaOrb: High-performance reactive visualizer with gyroscopic rings,
 * pulsing core, orbiting satellites, and energy field effect.
 */
const MayaOrb: React.FC<{
  volume: number;
  isRigid: boolean;
  isError?: boolean;
  themeColor?: string;
  isProcessing?: boolean;
}> = ({ volume, isRigid, isError, themeColor = 'rgba(34, 211, 238, 0.3)', isProcessing }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);

  // Parse theme color to extract RGB for reuse
  const colorRef = useRef<[number, number, number]>([34, 211, 238]);
  useEffect(() => {
    const match = themeColor.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (match) colorRef.current = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
    if (isError) colorRef.current = [239, 68, 68];
    else if (isRigid) colorRef.current = [239, 68, 68];
  }, [themeColor, isError, isRigid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const SIZE = 600;
    const CX = SIZE / 2;
    const CY = SIZE / 2;

    // Energy field particles
    const fieldParticles: { angle: number; speed: number; phase: number; dist: number; size: number }[] = [];
    const fieldCount = isRigid ? 20 : 80;
    for (let i = 0; i < fieldCount; i++) {
      fieldParticles.push({
        angle: (i / fieldCount) * Math.PI * 2,
        speed: 0.003 + Math.random() * 0.008,
        phase: Math.random() * Math.PI * 2,
        dist: 60 + Math.random() * 60,
        size: 0.5 + Math.random() * 1.5,
      });
    }

    // Satellite objects
    const satellites: { angle: number; speed: number; orbitRadius: number; size: number }[] = [];
    for (let i = 0; i < 5; i++) {
      satellites.push({
        angle: (i / 5) * Math.PI * 2,
        speed: 0.008 + Math.random() * 0.006,
        orbitRadius: 100 + i * 18,
        size: 2 + Math.random() * 2,
      });
    }

    // Gyroscopic ring state
    let ring1Angle = 0;
    let ring2Angle = Math.PI / 3;
    let ring3Angle = (2 * Math.PI) / 3;
    let corePhase = 0;

    const render = (time: number) => {
      ctx.clearRect(0, 0, SIZE, SIZE);
      const [r, g, b] = colorRef.current;
      const ringSpeed = isProcessing ? 0.025 : 0.006;
      const volBoost = volume * 30;

      // -- Energy Field --
      for (const p of fieldParticles) {
        p.phase += p.speed * (1 + volume * 4);
        const wobble = Math.sin(p.phase) * (15 + volBoost);
        const dist = p.dist + wobble;
        const x = CX + Math.cos(p.angle + time * 0.0001) * dist;
        const y = CY + Math.sin(p.angle + time * 0.0001) * dist;
        const alpha = 0.15 + Math.sin(p.phase) * 0.1 + volume * 0.2;

        ctx.beginPath();
        ctx.arc(x, y, p.size + volume * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.max(0.05, Math.min(alpha, 0.5))})`;
        ctx.fill();
      }

      // Energy field connecting lines
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.04)`;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < fieldParticles.length; i += 3) {
        const p1 = fieldParticles[i];
        const p2 = fieldParticles[(i + 1) % fieldParticles.length];
        const w1 = Math.sin(p1.phase) * (15 + volBoost);
        const w2 = Math.sin(p2.phase) * (15 + volBoost);
        const x1 = CX + Math.cos(p1.angle + time * 0.0001) * (p1.dist + w1);
        const y1 = CY + Math.sin(p1.angle + time * 0.0001) * (p1.dist + w1);
        const x2 = CX + Math.cos(p2.angle + time * 0.0001) * (p2.dist + w2);
        const y2 = CY + Math.sin(p2.angle + time * 0.0001) * (p2.dist + w2);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // -- Pulsing Core --
      corePhase += isProcessing ? 0.08 : 0.03;
      const corePulse = 0.6 + Math.sin(corePhase) * 0.4;
      const coreRadius = 18 + volume * 25 + corePulse * 8;

      const coreGrad = ctx.createRadialGradient(CX, CY, 0, CX, CY, coreRadius * 3);
      coreGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.3 * corePulse})`);
      coreGrad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${0.08 * corePulse})`);
      coreGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.beginPath();
      ctx.arc(CX, CY, coreRadius * 3, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();

      const coreInnerGrad = ctx.createRadialGradient(CX, CY, 0, CX, CY, coreRadius);
      coreInnerGrad.addColorStop(0, `rgba(255, 255, 255, ${0.6 * corePulse})`);
      coreInnerGrad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${0.8 * corePulse})`);
      coreInnerGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.1)`);
      ctx.beginPath();
      ctx.arc(CX, CY, coreRadius, 0, Math.PI * 2);
      ctx.fillStyle = coreInnerGrad;
      ctx.fill();

      // -- Gyroscopic Rings --
      ring1Angle += ringSpeed;
      ring2Angle -= ringSpeed * 0.7;
      ring3Angle += ringSpeed * 0.4;

      const drawRing = (angle: number, tiltX: number, tiltY: number, radius: number, alpha: number) => {
        ctx.save();
        ctx.translate(CX, CY);
        ctx.rotate(angle);
        ctx.scale(1, tiltY);
        ctx.beginPath();
        ctx.ellipse(0, 0, radius + volBoost * 0.5, radius * tiltX + volBoost * 0.3, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.lineWidth = isProcessing ? 1.5 : 0.8;
        ctx.stroke();
        ctx.restore();
      };

      const ringBase = 90 + volume * 40;
      drawRing(ring1Angle, 0.3, 0.85, ringBase, isError ? 0.5 : 0.25);
      drawRing(ring2Angle, 0.25, 0.7, ringBase + 15, isError ? 0.4 : 0.18);
      drawRing(ring3Angle, 0.35, 0.6, ringBase + 30, isError ? 0.3 : 0.12);

      // -- Orbiting Satellites --
      for (const sat of satellites) {
        sat.angle += sat.speed * (1 + volume * 3);
        const orbitR = sat.orbitRadius + volBoost;
        const sx = CX + Math.cos(sat.angle) * orbitR;
        const sy = CY + Math.sin(sat.angle) * orbitR * 0.6;
        const satAlpha = 0.4 + volume * 0.4;

        const satGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sat.size * 4);
        satGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${satAlpha * 0.5})`);
        satGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.beginPath();
        ctx.arc(sx, sy, sat.size * 4, 0, Math.PI * 2);
        ctx.fillStyle = satGrad;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(sx, sy, sat.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${satAlpha})`;
        ctx.fill();
      }

      // -- Glitch lines --
      if ((isRigid || isError) && Math.random() > 0.92) {
        ctx.fillStyle = isError ? `rgba(${r}, ${g}, ${b}, 0.4)` : `rgba(${r}, ${g}, ${b}, 0.15)`;
        const glitchY = CY + (Math.random() - 0.5) * 100;
        ctx.fillRect(CX - 150, glitchY, 300, 1);
      }

      requestRef.current = requestAnimationFrame(render);
    };

    requestRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(requestRef.current);
  }, [volume, isRigid, isError, themeColor, isProcessing]);

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
  const [showShowcase, setShowShowcase] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [showTranscript, setShowTranscript] = useState(true); // Default to visible
  const [showPersonality, setShowPersonality] = useState(false);
  const [showErrorLog, setShowErrorLog] = useState(false);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [showMicSelector, setShowMicSelector] = useState(false);
  const [wireGain, setWireGain] = useState(100);
  const [mayaState, setMayaState] = useState<MayaState>(INITIAL_MAYA_STATE);
  const [errorLog, setErrorLog] = useState<ErrorLogEntry[]>([]);
  const [securityLevel, setSecurityLevel] = useState<SecurityLevel>('safe');
  const [textInput, setTextInput] = useState('');
  const [selectedMic, setSelectedMic] = useState('');
  const [micMuted, setMicMuted] = useState(false);

  // Connection State
  const [systemOnline, setSystemOnline] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Show component showcase if toggled
  if (showShowcase) {
    return <ComponentShowcase onBack={() => setShowShowcase(false)} />;
  }

  // --- AUDIO PIPELINE HOOKS ---
  const { speak, stop: stopSpeaking, isSpeaking, volume, engine: ttsEngine, setEngine: setTtsEngine } = useElevenLabs();

  // --- ERROR LOGGING ---
  const addError = useCallback((code: string, message: string, source: ErrorLogEntry['source'], details?: any) => {
    const errorEntry = {
      id: Date.now().toString() + Math.random().toString(),
      timestamp: new Date(),
      code,
      message: details ? `${message} | Details: ${JSON.stringify(details).slice(0, 200)}` : message,
      source
    };
    setErrorLog(prev => [errorEntry, ...prev]);
    console.error(`[${source}] ${code}:`, message, details);
  }, []);

  // --- CORE INTELLIGENCE LOOP ---
  const handleUserInput = useCallback(async (text: string, skipTTS: boolean = false) => {
    if (!text.trim() || isProcessing) return;

    setIsProcessing(true);

    // 1. Add User Message
    const userMsg: TranscriptItem = {
      id: Date.now().toString(),
      role: 'user',
      text,
      timestamp: new Date()
    };
    setTranscript(prev => [...prev, userMsg]);

    try {
      // 2. Generate Gemini Response
      // Convert transcript to Gemini history format
      const history = transcript.map(t => ({ role: t.role, text: t.text }));
      const responseText = await generateMayaResponse(history, text);

      if (!responseText || responseText.startsWith('ERR:')) {
        throw new Error(responseText || 'Empty response from AI');
      }

      // 3. Add Agent Message
      const agentMsg: TranscriptItem = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: new Date()
      };
      setTranscript(prev => [...prev, agentMsg]);

      // 4. Speak Response (unless text input)
      if (!skipTTS && systemOnline) {
        await speak(responseText);
      }
    } catch (err: any) {
      addError("INTELLIGENCE_FAILURE", err.message || "Unknown Error", "SYSTEM", {
        stack: err.stack?.slice(0, 300),
        input: text.slice(0, 100),
        transcriptLength: transcript.length
      });
    } finally {
      setIsProcessing(false);
    }
  }, [transcript, isProcessing, speak, addError, systemOnline]);

  const handleUserSpeech = useCallback((text: string) => handleUserInput(text, false), [handleUserInput]);

  const handleTextMessage = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (!textInput.trim()) return;
    handleUserInput(textInput, true); // Skip TTS for text input
    setTextInput('');
  }, [textInput, handleUserInput]);

  // --- VISION HANDLER ---
  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      addError("VISION_ERROR", "File must be an image", "SYSTEM");
      return;
    }

    setIsProcessing(true);

    try {
      // Convert to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const base64Data = await base64Promise;

      // Call vision API
      const response = await fetch('https://svqbfxdhpsmioaosuhkb.supabase.co/functions/v1/mjrvs_vision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          action: 'analyze_base64',
          base64_data: base64Data,
          mime_type: file.type,
          media_type: 'image',
          user_id: 'rami', // TODO: Replace with auth-derived user ID when auth is implemented
        }),
      });

      if (!response.ok) {
        let errorMessage: string;
        try {
          const errorBody = await response.json() as { error?: string };
          errorMessage = errorBody.error || `HTTP ${response.status}`;
        } catch {
          const fallbackText = await response.text().catch(() => 'Unknown error');
          errorMessage = `HTTP ${response.status}: ${fallbackText}`;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();

      // Inject analysis into conversation
      const visionMsg: TranscriptItem = {
        id: Date.now().toString(),
        role: 'user',
        text: `[Image uploaded: ${file.name}]\n\nVision Analysis:\n${result.analysis_text}`,
        timestamp: new Date()
      };
      setTranscript(prev => [...prev, visionMsg]);

      // Maya acknowledges
      const ackMsg: TranscriptItem = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "Image analyzed. Ask me about what you see.",
        timestamp: new Date()
      };
      setTranscript(prev => [...prev, ackMsg]);
      if (systemOnline) {
        await speak("Image analyzed. Ask me about what you see.");
      }

    } catch (err: any) {
      addError("VISION_FAILURE", err.message || "Unknown Error", "SYSTEM", {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        error: err.toString()
      });
    } finally {
      setIsProcessing(false);
    }
  }, [transcript, addError, speak, systemOnline]);

  // STT Hook
  const { isListening, startListening, stopListening, interimTranscript, engine: sttEngine, setEngine: setSttEngine } = useSpeechToText(handleUserSpeech);

  // --- ORCHESTRATION LOOP ---
  // Manage Microphone vs Speaker state to prevent echo
  useEffect(() => {
    if (!systemOnline) return;

    if (isSpeaking || isProcessing) {
      if (isListening) stopListening();
    } else {
      if (!isListening) startListening();
    }
  }, [systemOnline, isSpeaking, isProcessing, isListening, startListening, stopListening]);

  // --- SYSTEM TOGGLE ---
  const handleToggleSystem = () => {
    if (systemOnline) {
      // Full system shutdown sequence
      stopListening();
      stopSpeaking();
      setSystemOnline(false);
      setIsProcessing(false);
      setTranscript([]);
      setErrorLog([]);
      setMayaState(INITIAL_MAYA_STATE);
      setSecurityLevel('safe');
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

  return (
    <div className={`hud-grid holo-scene font-mono transition-colors duration-700 ${theme.text} selection:bg-cyan-500/30 border-[4px] ${securityLevel === 'safe' ? 'border-transparent' : theme.border} ${securityLevel === 'critical' ? 'animate-pulse' : ''}`}>
      {/* Holographic overlays */}
      <div className="hex-mesh-overlay" />
      <div className="scanline-overlay" />
      <div className="crt-vignette" />

      {/* Floating Command Bar */}
      <GlassPanel variant="heavy" className={`hud-command-bar floating-command-bar flex items-center justify-between px-6 py-4 neon-border z-30 transition-colors duration-500`}>
        <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setShowPersonality(!showPersonality)}>
          <div className="p-2 bg-white/5 border border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.05)] transition-colors">
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
               <div className={`flex items-center gap-1 ${systemOnline ? 'text-zinc-500' : 'text-zinc-800'}`}>
                 <Cpu size={10} />
                 MODE: {ttsEngine === 'ELEVEN_LABS' ? 'NEURAL' : 'NATIVE'}
               </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
           <TactileButton
             state="default"
             onClick={() => setShowShowcase(!showShowcase)}
             icon={<TestTube size={14} />}
             className="px-3 py-2 text-[10px]"
           >
             TEST
           </TactileButton>
           <TactileButton
             state={showMicSelector ? 'online' : 'default'}
             onClick={() => setShowMicSelector(!showMicSelector)}
             icon={<Mic size={14} />}
             className="px-3 py-2 text-[10px]"
           >
             MIC
           </TactileButton>
           <TactileButton
             state={ttsEngine === 'ELEVEN_LABS' ? 'online' : 'default'}
             onClick={() => setTtsEngine(prev => prev === 'ELEVEN_LABS' ? 'WEB_NATIVE' : 'ELEVEN_LABS')}
             className="px-3 py-2 text-[10px]"
           >
             TTS:{ttsEngine === 'ELEVEN_LABS' ? '11.LABS' : 'WEB'}
           </TactileButton>
           <TactileButton
             state={sttEngine === 'ELEVEN_LABS_REALTIME' ? 'online' : 'default'}
             onClick={() => setSttEngine(prev => prev === 'ELEVEN_LABS_REALTIME' ? 'WEB_SPEECH' : 'ELEVEN_LABS_REALTIME')}
             className="px-3 py-2 text-[10px]"
           >
             STT:{sttEngine === 'ELEVEN_LABS_REALTIME' ? '11.LABS' : 'WEB'}
           </TactileButton>
           <TactileButton
             state={showFileUpload ? 'online' : 'default'}
             onClick={() => setShowFileUpload(!showFileUpload)}
             icon={<Upload size={14} />}
             className="px-3 py-2 text-[10px]"
           >
             FILES
           </TactileButton>
           <TactileButton
             state="default"
             onClick={() => document.getElementById('image-upload')?.click()}
             icon={<Image size={14} />}
             className="px-3 py-2 text-[10px]"
           >
             VISION
           </TactileButton>
           <input
             id="image-upload"
             type="file"
             accept="image/*"
             className="hidden"
             onChange={(e) => {
               const file = e.target.files?.[0];
               if (file) handleImageUpload(file);
               e.target.value = '';
             }}
           />
           <TactileButton
             state={errorLog.length > 0 ? 'error' : 'default'}
             onClick={() => setShowErrorLog(!showErrorLog)}
             icon={<FileWarning size={16} />}
             className="px-3 py-2"
           />
          <TactileButton
            state={showTranscript ? 'online' : 'default'}
            onClick={() => setShowTranscript(!showTranscript)}
            icon={<MessageSquare size={18} />}
            className="px-3 py-2"
          />
        </div>
      </GlassPanel>

      {/* MicSelector Overlay */}
      <GlassPanel variant="heavy" className={`fixed right-4 top-24 w-96 z-40 transition-transform duration-500 ${showMicSelector ? 'translate-x-0' : 'translate-x-[120%]'} p-6 neon-border`}>
        <div className="flex justify-between items-center mb-4 border-b border-cyan-900/30 pb-3">
          <div className="flex items-center gap-2">
            <Mic className="text-cyan-400" size={16} />
            <h2 className="text-cyan-400 text-xs font-bold uppercase tracking-wider font-mono">Audio Device</h2>
          </div>
          <button onClick={() => setShowMicSelector(false)} className="text-zinc-600 hover:text-cyan-400 transition-colors"><X size={20} /></button>
        </div>
        <MicSelector
          value={selectedMic}
          onValueChange={setSelectedMic}
          muted={micMuted}
          onMutedChange={setMicMuted}
        />
      </GlassPanel>

      {/* FileUpload Overlay */}
      <GlassPanel variant="heavy" className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] z-40 transition-all duration-500 ${showFileUpload ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'} p-6 neon-border`}>
        <div className="flex justify-between items-center mb-4 border-b border-cyan-900/30 pb-3">
          <div className="flex items-center gap-2">
            <Upload className="text-cyan-400" size={16} />
            <h2 className="text-cyan-400 text-xs font-bold uppercase tracking-wider font-mono">File Upload</h2>
          </div>
          <button onClick={() => setShowFileUpload(false)} className="text-zinc-600 hover:text-cyan-400 transition-colors"><X size={20} /></button>
        </div>
        <FileUpload
          onFilesSelected={(files) => {
            console.log('Files selected:', files);
            // Handle file upload logic here
          }}
          maxFiles={5}
          maxSize={20}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
        />
      </GlassPanel>

      {/* Error Log Overlay */}
      <GlassPanel variant="heavy" glow={false} className={`fixed inset-x-0 bottom-0 top-0 z-50 transition-transform duration-500 ${showErrorLog ? 'translate-y-0' : 'translate-y-[120%]'} flex flex-col p-8 neon-border-red`}>
        <div className="flex justify-between items-center mb-6 border-b border-red-900/30 pb-4">
           <div className="flex items-center gap-3"><div className="p-2 bg-red-500/10 border border-red-500/20 rounded-none animate-pulse"><Bug className="text-red-500" size={20} /></div><div className="flex flex-col"><h2 className="text-red-500 text-sm font-bold uppercase tracking-[0.2em] font-mono">System Diagnostics Log</h2><p className="text-zinc-600 text-[10px] mt-1">{errorLog.length} ENTRIES • DETAILED_MODE</p></div></div>
           <button onClick={() => setShowErrorLog(false)} className="text-zinc-600 hover:text-red-500 transition-colors p-2"><X size={24} /></button>
        </div>
        <div className="flex-1 overflow-y-auto holo-scrollbar font-mono text-xs space-y-1">
           {errorLog.length === 0 && <div className="text-center text-zinc-700 py-8">NO_ERRORS_LOGGED</div>}
           {errorLog.map(log => (<div key={log.id} className="grid grid-cols-[110px_100px_180px_1fr] gap-4 p-3 border-l-2 border-red-900/30 bg-red-950/5 hover:bg-red-950/10 transition-colors"><span className="text-zinc-500 font-holo-data">{log.timestamp.toLocaleTimeString()}.{log.timestamp.getMilliseconds()}</span><span className="font-bold text-cyan-600 font-holo-data">{log.source}</span><span className="text-red-400 font-bold font-holo-data">{log.code}</span><span className="text-zinc-400 break-words">{log.message}</span></div>))}
        </div>
      </GlassPanel>

      {/* Left Sidebar: Personality Parameters */}
      <GlassPanel variant="heavy" className={`hud-sidebar fixed inset-y-0 left-0 w-[320px] transition-transform duration-500 ${showPersonality ? 'translate-x-0' : '-translate-x-full'} z-20 flex flex-col lg:relative lg:translate-x-0 ${showPersonality ? '' : 'lg:hidden'}`}>
        <div className="p-6 border-b border-zinc-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3 font-mono"><Settings2 className={`w-4 h-4 ${theme.text} ${theme.glow}`} /><h3 className="font-bold uppercase tracking-[0.2em] text-[10px] text-zinc-500 font-holo-label">PARAM_MONITOR</h3></div>
          <button onClick={() => setShowPersonality(false)} className="text-zinc-700 hover:text-cyan-400 transition-colors lg:hidden"><X size={14} /></button>
        </div>
        <div className="flex-1 p-6 space-y-8 overflow-y-auto holo-scrollbar">
          <div className="space-y-3"><RadarChart data={{ caution: mayaState.personality.caution_level, formality: mayaState.personality.formality_level, trust: mayaState.personality.trust_level, depth: mayaState.personality.relationship_depth }} /></div>
          <PersonalitySlider label="Caution" icon={<Shield size={14} />} value={mayaState.personality.caution_level} onChange={val => setMayaState(p => ({...p, personality: {...p.personality, caution_level: val}}))} theme={theme} />
          <PersonalitySlider label="Formality" icon={<GraduationCap size={14} />} value={mayaState.personality.formality_level} onChange={val => setMayaState(p => ({...p, personality: {...p.personality, formality_level: val}}))} theme={theme} />
          <GlassPanel variant="light" className="p-4 space-y-4">
             <div className="flex items-center justify-between">
               <div className={`flex items-center gap-2 ${theme.text} ${theme.glow}`}><Volume2 size={14} /><span className="text-[10px] font-bold uppercase tracking-widest font-holo-label">PROP_GAIN</span></div>
               <span className={`text-[10px] font-holo-data ${theme.text} ${theme.glow}`}>{wireGain}%</span>
             </div>
             <input type="range" min="0" max="200" value={wireGain} onChange={e => setWireGain(parseInt(e.target.value))} className={`w-full h-1 bg-zinc-900 appearance-none cursor-pointer accent-current ${theme.text}`} />
          </GlassPanel>
        </div>
      </GlassPanel>

      {/* Center: Orb + HUD Telemetry */}
      <div className="hud-center">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none px-8 lg:px-20 z-0">
          <div className={`flex flex-col gap-1 font-holo-data text-[10px] uppercase tracking-[0.2em] leading-loose text-zinc-500 border-r-2 ${theme.borderDim} pr-3 transition-colors duration-500`}>
             <div>0x8F9A | SYS.FRC_LOAD :: [{mayaState.cognitive_soma.friction_load.toFixed(2)}]</div>
             <div className={isSpeaking ? theme.text : "opacity-30"}>SIGNAL_VOL :: {(volume * 100).toFixed(1)}%</div>
          </div>
          <div className={`flex flex-col gap-1 font-holo-data text-[10px] uppercase tracking-[0.2em] leading-loose text-zinc-500 border-l-2 ${theme.borderDim} pl-3 text-right transition-colors duration-500`}>
             <div className={systemOnline ? "text-green-600" : "text-red-500"}>CORE :: {systemOnline ? "GEMINI_BRIDGE_ACTIVE" : "OFFLINE"}</div>
             <div>TTS :: {ttsEngine === 'ELEVEN_LABS' ? 'ELEVENLABS_V3' : 'WEB_NATIVE_API'}</div>
             <div>STT :: {sttEngine === 'ELEVEN_LABS_REALTIME' ? 'ELEVENLABS_SCRIBE_V2' : 'WEB_SPEECH_API'}</div>
             {isProcessing && <div className="text-cyan-400 animate-pulse">{'>>'} INFERENCE_ACTIVE</div>}
          </div>
        </div>

        <div className="flex items-center justify-center relative z-10 scale-[1.2]">
          <MayaOrb volume={volume} isRigid={isRigid} themeColor={theme.orbColor} isProcessing={isProcessing} />
          {isListening && interimTranscript && (
             <div className="absolute top-full mt-8 text-center max-w-md">
               <p className="text-zinc-500 text-xs font-mono animate-pulse">{interimTranscript}</p>
             </div>
          )}
          {isProcessing && (
             <div className="absolute top-full mt-8 flex items-center gap-2">
               <Loader2 className={`animate-spin ${theme.text}`} size={16} />
               <span className={`text-[10px] font-bold uppercase tracking-widest ${theme.text} font-holo-label`}>PROCESSING_NEURAL_PATH...</span>
             </div>
          )}
        </div>
      </div>

      {/* Right Sidebar: Transcript */}
      <GlassPanel variant="heavy" className={`hud-transcript fixed inset-y-0 right-0 w-[440px] transition-transform duration-500 ${showTranscript ? 'translate-x-0' : 'translate-x-full'} z-20 lg:relative lg:w-[400px] lg:translate-x-0 overflow-hidden ${showTranscript ? '' : 'lg:hidden'}`}>
        {/* Header */}
        <div className="p-6 border-b border-zinc-900/50 flex justify-between items-center flex-shrink-0 bg-black/40">
          <div className="flex items-center gap-3 font-mono">
            <Terminal className={`w-4 h-4 ${theme.text} ${theme.glow}`} />
            <h3 className="font-bold uppercase tracking-[0.2em] text-[10px] text-zinc-500 font-holo-label">NEURAL_FEED</h3>
            <span className="text-[9px] text-zinc-700">({transcript.length})</span>
          </div>
          <button onClick={() => setShowTranscript(false)} className="p-2 hover:bg-zinc-900 transition-colors border border-transparent hover:border-zinc-800 text-zinc-500 lg:hidden">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto holo-scrollbar p-8">
          {transcript.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6 px-12 animate-pulse">
              <div className="relative p-10 glass-panel neon-border-pulse">
                <BrainCircuit className="w-14 h-14 text-cyan-500/10" />
              </div>
              <div className="space-y-3">
                <h4 className="font-holo-label text-zinc-600 tracking-[0.5em] neon-text-subtle" style={{ fontSize: '11px' }}>LINK_IDLE</h4>
                <p className="text-[10px] text-zinc-700 max-w-[280px] mx-auto leading-relaxed font-bold tracking-widest font-mono uppercase">AWAITING_TRACE_INJECTION_AND_HANDSHAKE.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col w-full max-w-4xl mx-auto">
              {transcript.map(item => (
                <Message key={item.id} from={item.role === 'user' ? 'user' : 'assistant'} timestamp={item.timestamp}>
                  <MessageContent from={item.role === 'user' ? 'user' : 'assistant'}>
                    {item.role === 'model' ? (
                      <Response>{item.text}</Response>
                    ) : (
                      <span className="text-zinc-300">{item.text}</span>
                    )}
                  </MessageContent>
                </Message>
              ))}
            </div>
          )}
        </div>
      </GlassPanel>

      {/* Floating Control Deck */}
      <GlassPanel className="hud-control-deck floating-control-deck z-30 px-6 py-4 flex flex-col gap-4">
        {/* System Control */}
        <div className="flex items-center justify-center gap-4">
          <TactileButton
            state={systemOnline ? 'online' : 'offline'}
            onClick={handleToggleSystem}
            icon={systemOnline ? <Unlink size={14} /> : <Activity size={14} />}
          >
            {systemOnline ? "SEVER_UPLINK" : "ESTABLISH_UPLINK"}
          </TactileButton>

          {/* Status Indicators */}
          {systemOnline && (
            <>
              <div className="h-6 w-px bg-zinc-800" />
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isListening ? 'bg-red-500 animate-pulse' : 'bg-zinc-700'}`} />
                  <span className={`text-[9px] font-mono font-bold tracking-widest uppercase ${isListening ? 'text-red-500' : 'text-zinc-600'}`}>
                    {isListening ? 'MIC' : 'IDLE'}
                  </span>
                </div>
                {isSpeaking && (
                  <div className="flex items-center gap-2 px-2 py-1 bg-cyan-900/20 border border-cyan-500/20">
                    <Radio size={10} className="text-cyan-400 animate-pulse" />
                    <span className="text-[9px] font-bold text-cyan-400 tracking-widest uppercase">TX</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Text Input - Always Visible */}
        <div className="w-full max-w-2xl mx-auto">
          <div className="bg-zinc-950 border border-zinc-800 neon-border flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-900 bg-zinc-900/50">
              <Terminal size={12} className="text-zinc-500" />
              <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">TEXT_INTERFACE</span>
              {isProcessing && <Loader2 size={10} className="animate-spin text-cyan-400 ml-auto" />}
            </div>

            <form onSubmit={handleTextMessage} className="flex p-1 bg-black">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={systemOnline ? "ENTER_COMMAND..." : "ACTIVATE_SYSTEM_FIRST..."}
                className="flex-1 bg-transparent px-3 py-2 text-[11px] font-mono text-cyan-400 placeholder:text-zinc-800 focus:outline-none disabled:opacity-50"
                disabled={isProcessing}
              />
              <button
                type="submit"
                disabled={!textInput.trim() || isProcessing}
                className="px-3 text-zinc-500 hover:text-cyan-400 disabled:opacity-30 disabled:hover:text-zinc-500 transition-colors"
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </div>
      </GlassPanel>
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