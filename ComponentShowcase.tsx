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
  const [messages] = useState([
    { id: '1', role: 'user' as const, text: 'Test message from user', timestamp: new Date() },
    { id: '2', role: 'model' as const, text: '# Response Test\n\nThis is a **streaming markdown** response with:\n\n- Lists\n- `inline code`\n- **Bold text**\n\n```javascript\nconst test = "code block";\n```', timestamp: new Date() },
  ]);

  const [selectedMic, setSelectedMic] = useState('');
  const [micMuted, setMicMuted] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--bg-void)] text-[var(--text-primary)] p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <GlassPanel variant="heavy" className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <TactileButton state="default" onClick={onBack} icon={<ArrowLeft size={14} />}>
                Back to main
              </TactileButton>
              <div className="flex items-center gap-3">
                <TestTube size={20} className="text-[var(--accent-warm)]" />
                <h1 className="text-xl maya-mono uppercase tracking-[0.12em]">
                  Component test suite
                </h1>
              </div>
            </div>
          </div>
        </GlassPanel>

        {/* Conversation + Message + Response */}
        <GlassPanel variant="heavy" className="p-6">
          <div className="text-xs maya-mono uppercase tracking-[0.12em] text-[var(--accent-warm)] mb-4">
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
          <div className="text-xs maya-mono uppercase tracking-[0.12em] text-[var(--accent-warm)] mb-4">
            ConversationBar • Voice Interface
          </div>
          <ConversationBar
            agentId="test-agent-id"
            onConnect={() => console.log('Connected')}
            onDisconnect={() => console.log('Disconnected')}
            onMessage={(msg) => console.log('Message:', msg)}
            onError={(message, context) => console.error('Error:', message, context)}
          />
        </GlassPanel>

        {/* MicSelector */}
        <GlassPanel variant="heavy" className="p-6">
          <div className="text-xs maya-mono uppercase tracking-[0.12em] text-[var(--accent-warm)] mb-4">
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
          <div className="text-xs maya-mono uppercase tracking-[0.12em] text-[var(--accent-warm)] mb-4">
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
          <div className="text-xs maya-mono uppercase tracking-[0.12em] text-[var(--accent-warm)] mb-4">
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
              <div key={name} className="maya-surface border border-[var(--border-subtle)] p-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-[var(--accent-warm)]" />
                <span className="text-xs maya-mono text-[var(--text-primary)]">{name}</span>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
};
