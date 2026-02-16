import React, { useState } from 'react';
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton, Message, MessageContent } from './Message';
import { Response } from './Response';
import { ConversationBar } from './ConversationBar';
import { MicSelector } from './MicSelector';
import { FileUpload } from './FileUpload';
import GlassPanel from './GlassPanel';
import TactileButton from './TactileButton';
import { ArrowLeft, TestTube } from 'lucide-react';

interface ComponentShowcaseProps {
  onBack: () => void;
}

export const ComponentShowcase: React.FC<ComponentShowcaseProps> = ({ onBack }) => {
  const [messages, setMessages] = useState([
    { id: '1', role: 'user' as const, text: 'Test message from user', timestamp: new Date() },
    { id: '2', role: 'model' as const, text: '# Response Test\n\nThis is a **streaming markdown** response with:\n\n- Lists\n- `inline code`\n- **Bold text**\n\n```javascript\nconst test = "code block";\n```', timestamp: new Date() },
  ]);

  const [selectedMic, setSelectedMic] = useState('');
  const [micMuted, setMicMuted] = useState(false);

  return (
    <div className="min-h-screen bg-black text-cyan-400 p-8 grid-substrate">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <GlassPanel variant="heavy" className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <TactileButton state="default" onClick={onBack} icon={<ArrowLeft size={14} />}>
                BACK_TO_MAIN
              </TactileButton>
              <div className="flex items-center gap-3">
                <TestTube size={20} className="text-cyan-400 phosphor-glow" />
                <h1 className="text-xl font-mono uppercase tracking-wider phosphor-glow-strong">
                  COMPONENT_TEST_SUITE
                </h1>
              </div>
            </div>
          </div>
        </GlassPanel>

        {/* Conversation + Message + Response */}
        <GlassPanel variant="heavy" className="p-6">
          <div className="text-xs font-mono uppercase tracking-wider text-cyan-400 mb-4 phosphor-glow">
            Conversation • Message • Response
          </div>
          <div className="h-96">
            <Conversation>
              <ConversationContent>
                {messages.length === 0 ? (
                  <ConversationEmptyState />
                ) : (
                  messages.map((msg) => (
                    <Message key={msg.id} from={msg.role === 'user' ? 'user' : 'assistant'} timestamp={msg.timestamp}>
                      <MessageContent from={msg.role === 'user' ? 'user' : 'assistant'}>
                        {msg.role === 'model' ? (
                          <Response>{msg.text}</Response>
                        ) : (
                          msg.text
                        )}
                      </MessageContent>
                    </Message>
                  ))
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          </div>
        </GlassPanel>

        {/* ConversationBar */}
        <GlassPanel variant="heavy" className="p-6">
          <div className="text-xs font-mono uppercase tracking-wider text-cyan-400 mb-4 phosphor-glow">
            ConversationBar • Voice Interface
          </div>
          <ConversationBar
            agentId="test-agent-id"
            onConnect={() => console.log('Connected')}
            onDisconnect={() => console.log('Disconnected')}
            onMessage={(msg) => console.log('Message:', msg)}
            onError={(err) => console.error('Error:', err)}
          />
        </GlassPanel>

        {/* MicSelector */}
        <GlassPanel variant="heavy" className="p-6">
          <div className="text-xs font-mono uppercase tracking-wider text-cyan-400 mb-4 phosphor-glow">
            MicSelector • Device Selection
          </div>
          <MicSelector
            value={selectedMic}
            onValueChange={setSelectedMic}
            muted={micMuted}
            onMutedChange={setMicMuted}
          />
        </GlassPanel>

        {/* FileUpload */}
        <GlassPanel variant="heavy" className="p-6">
          <div className="text-xs font-mono uppercase tracking-wider text-cyan-400 mb-4 phosphor-glow">
            FileUpload • Drag & Drop
          </div>
          <FileUpload
            onFilesSelected={(files) => console.log('Files selected:', files)}
            onFileRemove={(id) => console.log('File removed:', id)}
            maxFiles={5}
            maxSize={10}
            multiple
          />
        </GlassPanel>

        {/* Component Grid */}
        <GlassPanel variant="heavy" className="p-6">
          <div className="text-xs font-mono uppercase tracking-wider text-cyan-400 mb-4 phosphor-glow">
            Component Status
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              'Conversation',
              'ConversationScrollButton',
              'Message',
              'Response',
              'ConversationBar',
              'MicSelector',
              'FileUpload',
            ].map((name) => (
              <div key={name} className="glass-light neon-border p-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.6)]" />
                <span className="text-xs font-mono text-zinc-300">{name}</span>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
};
