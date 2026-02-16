import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.REACT_APP_GOOGLE_API_KEY': JSON.stringify(env.VITE_GOOGLE_API_KEY || env.GOOGLE_API_KEY),
        'process.env.REACT_APP_API_KEY': JSON.stringify(env.VITE_GOOGLE_API_KEY || env.GOOGLE_API_KEY),
        'process.env.REACT_APP_ELEVENLABS_API_KEY': JSON.stringify(env.VITE_ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY),
        'process.env.REACT_APP_ELEVENLABS_AGENT_ID': JSON.stringify(env.VITE_ELEVENLABS_AGENT_ID || env.ELEVENLABS_AGENT_ID),
        'process.env.REACT_APP_ELEVENLABS_VOICE_ID': JSON.stringify(env.VITE_ELEVENLABS_VOICE_ID || ''),
        'process.env.REACT_APP_ELEVENLABS_OUTPUT_FORMAT': JSON.stringify(env.VITE_ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_64'),
        'process.env.REACT_APP_ELEVENLABS_AUTO_MODE': JSON.stringify(env.VITE_ELEVENLABS_AUTO_MODE || 'false'),
        'process.env.REACT_APP_ANTHROPIC_API_KEY': JSON.stringify(env.VITE_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY),
        'process.env.GOOGLE_API_KEY': JSON.stringify(env.VITE_GOOGLE_API_KEY || env.GOOGLE_API_KEY),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
