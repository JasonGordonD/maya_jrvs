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
    <div className="flex flex-col gap-4 p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] w-full max-w-md mx-auto pointer-events-auto">
      
      {/* STATUS MONITOR */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-panel)] border border-[var(--border-medium)] rounded-none">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-2.5 h-2.5 rounded-full ${
              isListening ? 'bg-[var(--accent-warm)] animate-pulse' : 'bg-[var(--text-muted)]'
            }`} />
          </div>
          <span className={`text-[10px] maya-mono font-bold tracking-widest uppercase ${
            isListening ? 'text-[var(--accent-warm)]' : 'text-[var(--text-secondary)]'
          }`}>
            {isListening ? 'MIC_ACTIVE' : 'STANDBY'}
          </span>
        </div>
        
        {isSpeaking && (
          <div className="flex items-center gap-2 px-2 py-0.5 bg-[var(--accent-warm-dim)] border border-[var(--border-accent)]">
             <Radio size={10} className="text-[var(--accent-warm)] animate-pulse" />
             <span className="text-[9px] font-bold text-[var(--accent-warm)] tracking-widest uppercase">TX_ACTIVE</span>
          </div>
        )}
      </div>

      {/* TEXT INPUT */}
      <div className="bg-[var(--bg-panel)] border border-[var(--border-medium)] flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--glass)]">
          <Terminal size={12} className="text-[var(--text-secondary)]" />
          <span className="text-[9px] maya-mono text-[var(--text-secondary)] uppercase tracking-widest">TEXT_INJECTION</span>
        </div>
        
        <form onSubmit={handleSendMessage} className="flex p-1 bg-[var(--bg-surface)]">
          <input 
            type="text" 
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="TYPE_COMMAND..."
            className="flex-1 bg-transparent px-3 py-2 text-[11px] maya-mono text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
          />
          <button 
            type="submit" 
            disabled={!textInput.trim()}
            className="px-3 text-[var(--text-secondary)] hover:text-[var(--accent-warm)] disabled:opacity-30 disabled:hover:text-[var(--text-secondary)] transition-colors"
          >
            <Send size={14} />
          </button>
        </form>
      </div>

    </div>
  );
};