import { useState, useRef, useEffect, useCallback } from 'react';

export const useSpeechToText = (onFinalTranscript: (text: string) => void) => {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => {
        setIsListening(false); 
      };
      
      recognition.onerror = (event: any) => {
        // Filter out 'not-allowed' or 'no-speech' to prevent log spam
        if (event.error === 'not-allowed') {
            console.error("Speech Recognition Error:", event.error);
            setIsListening(false);
        }
      };

      recognition.onresult = (event: any) => {
        let final = '';
        let interim = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        if (final) {
          onFinalTranscript(final);
          setInterimTranscript('');
        } else {
          setInterimTranscript(interim);
        }
      };
      
      recognitionRef.current = recognition;
    } else {
        console.warn("Speech Recognition not supported in this browser.");
    }
  }, [onFinalTranscript]);

  const startListening = useCallback(() => {
    if (recognitionRef.current && recognitionRef.current.readyState !== 'started') {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch(e) {
        // Ignore errors if already started
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  return { isListening, interimTranscript, startListening, stopListening };
};