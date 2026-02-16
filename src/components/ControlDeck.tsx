import React, { useState } from 'react';
import { Send, Terminal, Radio } from 'lucide-react';

interface ControlDeckProps {
  isSpeaking: boolean;
  isListening: boolean;
  onSendMessage: (text: string) => void;
}

export const ControlDeck: React.FC<ControlDeckProps> = ({ isSpeaking, isListening, onSendMessage }) => {
  const [textInput, setTextInput] = useState('');
  
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    onSendMessage(textInput);
    setTextInput('');
  };

  return (
    <div className="flex flex-col gap-4 p-4 border-t border-cyan-900/30 bg-black w-full max-w-md mx-auto pointer-events-auto">
      
      {/* STATUS MONITOR */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/50 border border-zinc-800 rounded-none">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-2.5 h-2.5 rounded-full ${
              isListening ? 'bg-red-500 animate-pulse' : 'bg-green-500'
            }`} />
          </div>
          <span className={`text-[10px] font-mono font-bold tracking-widest uppercase ${
            isListening ? 'text-red-500' : 'text-zinc-500'
          }`}>
            {isListening ? 'MIC_ACTIVE' : 'STANDBY'}
          </span>
        </div>
        
        {isSpeaking && (
          <div className="flex items-center gap-2 px-2 py-0.5 bg-cyan-900/20 border border-cyan-500/20">
             <Radio size={10} className="text-cyan-400 animate-pulse" />
             <span className="text-[9px] font-bold text-cyan-400 tracking-widest uppercase">TX_ACTIVE</span>
          </div>
        )}
      </div>

      {/* TEXT INPUT */}
      <div className="bg-zinc-950 border border-zinc-800 flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-900 bg-zinc-900/50">
          <Terminal size={12} className="text-zinc-500" />
          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">TEXT_INJECTION</span>
        </div>
        
        <form onSubmit={handleSendMessage} className="flex p-1 bg-black">
          <input 
            type="text" 
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="TYPE_COMMAND..."
            className="flex-1 bg-transparent px-3 py-2 text-[11px] font-mono text-cyan-400 placeholder:text-zinc-800 focus:outline-none"
          />
          <button 
            type="submit" 
            disabled={!textInput.trim()}
            className="px-3 text-zinc-500 hover:text-cyan-400 disabled:opacity-30 disabled:hover:text-zinc-500 transition-colors"
          >
            <Send size={14} />
          </button>
        </form>
      </div>

    </div>
  );
};