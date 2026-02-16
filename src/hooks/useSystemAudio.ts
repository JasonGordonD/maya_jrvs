import { useState, useRef, useEffect, useCallback } from 'react';

export const useSystemAudio = (onAudioData: (base64: string) => void) => {
  const [isSharing, setIsSharing] = useState(false);
  const [systemVolume, setSystemVolume] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  // VAD Parameters
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speakingThreshold = 0.05; // 5% volume threshold
  const silenceDuration = 1500; // 1.5s silence to trigger stop
  const maxRecordDuration = 10000; // 10s max chunk size
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const stopSharing = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
    }
    
    setIsSharing(false);
    setSystemVolume(0);
    setIsRecording(false);
  }, []);

  const handleDataAvailable = useCallback((event: BlobEvent) => {
    if (event.data.size > 0) {
      chunksRef.current.push(event.data);
    }
  }, []);

  const handleStopRecording = useCallback(() => {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm; codecs=opus' });
    chunksRef.current = []; // Reset buffer
    setIsRecording(false);

    if (blob.size < 1000) return; // Ignore tiny empty blobs

    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      onAudioData(base64Data);
    };
  }, [onAudioData]);

  const startRecorder = useCallback(() => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'recording') return;
    
    chunksRef.current = [];
    mediaRecorderRef.current.start();
    setIsRecording(true);
    // console.log("System Audio: Recording Started (VAD)");

    // Safety timeout
    recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
    }, maxRecordDuration);

  }, [maxRecordDuration]);

  const stopRecorder = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        // console.log("System Audio: Recording Stopped (VAD)");
    }
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
  }, []);

  const startSharing = useCallback(async () => {
    try {
      // Capture system audio (usually requires video track in Chrome)
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: true, 
        audio: true 
      });

      // Verify we got an audio track
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        alert("No system audio detected. Please ensure you check the 'Share tab audio' or 'Share system audio' box.");
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      // We don't need the video track, but keeping it alive is sometimes required for audio to keep flowing.
      // We can just not display it.

      streamRef.current = stream;
      setIsSharing(true);

      // Handle stream end (user clicked "Stop Sharing" in browser UI)
      stream.getVideoTracks()[0].onended = () => {
        stopSharing();
      };

      // --- Audio Processing for Visualizer & VAD ---
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // --- Recorder Setup ---
      // We record just the audio track
      const audioStream = new MediaStream([audioTrack]);
      const recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm; codecs=opus' });
      recorder.ondataavailable = handleDataAvailable;
      recorder.onstop = handleStopRecording;
      mediaRecorderRef.current = recorder;

      // --- Analysis Loop ---
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const checkVolume = () => {
        if (!analyserRef.current || !streamRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Calculate RMS volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length) / 255;
        setSystemVolume(rms);

        // --- VAD LOGIC ---
        if (rms > speakingThreshold) {
            // Audio detected
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
            }
            if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
                startRecorder();
            }
        } else {
            // Silence
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording' && !silenceTimerRef.current) {
                silenceTimerRef.current = setTimeout(() => {
                    stopRecorder();
                }, silenceDuration);
            }
        }

        requestAnimationFrame(checkVolume);
      };
      
      checkVolume();

    } catch (err) {
      console.error("Error sharing system audio:", err);
      stopSharing();
    }
  }, [stopSharing, handleDataAvailable, handleStopRecording, startRecorder, stopRecorder, silenceDuration, speakingThreshold]);

  return { isSharing, startSharing, stopSharing, systemVolume, isRecording };
};