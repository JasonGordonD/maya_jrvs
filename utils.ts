
import { MayaState } from './types';

/**
 * Calculates ElevenLabs TTS parameters based on Maya's internal cognitive soma.
 * This provides "computational proprioception," where her internal processing 
 * friction and state modify her vocal texture in real-time.
 */
export const calculateElevenLabsSettings = (state: MayaState) => {
  // Baseline: highly stable, clear, resonant executive tone.
  let stability = 0.50; 
  let similarity_boost = 0.75;

  // The Rigidity Governor: High friction load makes her structurally rigid, not emotional.
  if (state.cognitive_soma.friction_load > 0.7) {
    stability = 0.95; // Artificially high. She clamps down. Cold, orthodox precision.
    similarity_boost = 0.90;
  }

  // Context Pressure: Forces her to compress and hyper-articulate.
  if (state.cognitive_soma.context_pressure > 0.8) {
    similarity_boost = 0.95; 
  }

  return { stability, similarity_boost };
};
