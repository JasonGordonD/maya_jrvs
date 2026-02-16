import React, { useState } from "react";
import { VoicePicker } from "./voice-picker";
import type { ElevenLabs } from "@elevenlabs/elevenlabs-js";

const DEMO_VOICES: ElevenLabs.Voice[] = [
  {
    voiceId: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    labels: { accent: "American", age: "Young" },
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/6edb9076-c3e4-420c-b6ab-11d43fe341c8.mp3",
  },
  {
    voiceId: "AZnzlk1XvdvUeBnXmlld",
    name: "Domi",
    labels: { accent: "American", age: "Young" },
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/AZnzlk1XvdvUeBnXmlld/69c5373f-0dc2-4efd-9232-a0571ce23571.mp3",
  },
  {
    voiceId: "EXAVITQu4vr4xnSDxMaL",
    name: "Bella",
    labels: { accent: "American", age: "Young" },
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/04b81800-9478-4465-80b5-1488e2fd67f3.mp3",
  },
  {
    voiceId: "ErXwobaYiN019PkySvjV",
    name: "Antoni",
    labels: { accent: "American", age: "Young" },
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/ErXwobaYiN019PkySvjV/38d8f8f0-1122-4333-b323-0b87478d506c.mp3",
  },
  {
    voiceId: "MF3mGyEYCl7XYWbV9V6O",
    name: "Elli",
    labels: { accent: "American", age: "Young" },
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/MF3mGyEYCl7XYWbV9V6O/d8539e3e-0c76-4a41-b86e-a3aac0d7b6b1.mp3",
  },
  {
    voiceId: "TxGEqnHWrfWFTfGW9XjX",
    name: "Josh",
    labels: { accent: "American", age: "Young" },
    previewUrl:
      "https://storage.googleapis.com/eleven-public-prod/premade/voices/TxGEqnHWrfWFTfGW9XjX/e56a8a35-1137-47c1-8156-3e22fafc9b5f.mp3",
  },
];

export const VoicePickerDemo: React.FC = () => {
  const [selectedVoice, setSelectedVoice] = useState("");

  return (
    <div style={{ padding: 24 }}>
      <VoicePicker
        voices={DEMO_VOICES}
        value={selectedVoice}
        onValueChange={setSelectedVoice}
      />
    </div>
  );
};

export default VoicePickerDemo;
