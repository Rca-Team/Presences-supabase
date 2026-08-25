import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Mic,
  MicOff,
  Volume2,
  Sparkles,
  Command,
  CheckCircle2,
  AlertCircle,
  Settings2,
  Loader2
} from 'lucide-react';

interface VoiceCommandsProps {
  onCommand?: (command: string) => void;
  onStartScan?: () => void;
  onStopScan?: () => void;
  onTakePhoto?: () => void;
  onConfirmAttendance?: () => void;
}

// Speech synthesis for feedback
const speak = (text: string) => {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 1;
    utterance.volume = 0.8;
    speechSynthesis.speak(utterance);
  }
};

const VoiceCommands: React.FC<VoiceCommandsProps> = ({ 
  onCommand,
  onStartScan,
  onStopScan,
  onTakePhoto,
  onConfirmAttendance 
}) => {
  const { toast } = useToast();
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [recognizedCommand, setRecognizedCommand] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const supported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    setIsSupported(supported);
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const commands = [
    { 
      triggers: ['scan', 'start scan', 'begin scan', 'start scanning', 'scan face', 'begin scanning'],
      action: 'scan',
      description: 'Start face scanning',
      feedback: 'Starting face scan',
      execute: () => onStartScan?.()
    },
    { 
      triggers: ['stop', 'stop scan', 'stop scanning', 'cancel', 'end scan'],
      action: 'stop',
      description: 'Stop scanning',
      feedback: 'Stopping scan',
      execute: () => onStopScan?.()
    },
    { 
      triggers: ['take attendance', 'mark attendance', 'record attendance', 'attendance', 'mark me present', 'mark present'],
      action: 'attendance',
      description: 'Mark attendance',
      feedback: 'Marking attendance',
      execute: () => onStartScan?.()
    },
    { 
      triggers: ['capture', 'take photo', 'snap', 'photo', 'capture image', 'take picture'],
      action: 'capture',
      description: 'Capture photo',
      feedback: 'Capturing photo',
      execute: () => onTakePhoto?.()
    },
    { 
      triggers: ['confirm', 'yes', 'ok', 'okay', 'correct', 'approve', 'verified'],
      action: 'confirm',
      description: 'Confirm action',
      feedback: 'Confirmed',
      execute: () => onConfirmAttendance?.()
    },
    { 
      triggers: ['show stats', 'statistics', 'show statistics', 'view stats', 'analytics', 'show analytics'],
      action: 'stats',
      description: 'View statistics',
      feedback: 'Showing statistics',
      execute: () => onCommand?.('stats')
    },
    { 
      triggers: ['show gallery', 'gallery', 'photos', 'view gallery', 'images', 'pictures'],
      action: 'gallery',
      description: 'View gallery',
      feedback: 'Opening gallery',
      execute: () => onCommand?.('gallery')
    },
    { 
      triggers: ['help', 'instructions', 'how to', 'what can you do', 'commands', 'list commands'],
      action: 'help',
      description: 'Show help',
      feedback: 'Here are the available commands',
      execute: () => onCommand?.('help')
    },
    { 
      triggers: ['switch to qr', 'qr code', 'qr scan', 'use qr', 'qr mode'],
      action: 'qr',
      description: 'Switch to QR mode',
      feedback: 'Switching to QR code scanner',
      execute: () => onCommand?.('qr')
    },
    { 
      triggers: ['switch to face', 'face scan', 'use face', 'face mode', 'biometric'],
      action: 'face',
      description: 'Switch to face mode',
      feedback: 'Switching to face scanner',
      execute: () => onCommand?.('face')
    },
  ];

  const processCommand = useCallback((text: string) => {
    const normalizedText = text.toLowerCase().trim();
    setIsProcessing(true);
    
    for (const cmd of commands) {
      if (cmd.triggers.some(trigger => normalizedText.includes(trigger))) {
        setRecognizedCommand(cmd.action);
        
        // Visual and audio feedback
        speak(cmd.feedback);
        
        toast({
          title: "✓ Command Recognized",
          description: cmd.feedback,
          duration: 2000,
        });
        
        // Execute the command
        setTimeout(() => {
          cmd.execute();
          setIsProcessing(false);
          setRecognizedCommand(null);
        }, 500);
        
        onCommand?.(cmd.action);
        return true;
      }
    }

    // Command not recognized
    speak("Sorry, I didn't understand that command");
    toast({
      title: "Command Not Recognized",
      description: `"${text}" - Try saying: "Start scan" or "Take attendance"`,
      variant: "destructive",
      duration: 3000,
    });
    
    setIsProcessing(false);
    return false;
  }, [onCommand, onStartScan, onStopScan, onTakePhoto, onConfirmAttendance, toast]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      toast({
        title: "Not Supported",
        description: "Voice commands are not supported in your browser. Try Chrome or Edge.",
        variant: "destructive"
      });
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    
    recognition.continuous = continuousMode;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript('');
      speak('Listening');
    };

    recognition.onresult = (event: any) => {
      const current = event.resultIndex;
      const alternatives = event.results[current];
      
      // Get the most confident result
      let bestTranscript = '';
      let highestConfidence = 0;
      
      for (let i = 0; i < alternatives.length; i++) {
        if (alternatives[i].confidence > highestConfidence) {
          highestConfidence = alternatives[i].confidence;
          bestTranscript = alternatives[i].transcript;
        }
      }
      
      const text = bestTranscript.toLowerCase();
      setTranscript(text);

      if (event.results[current].isFinal) {
        processCommand(text);
        if (continuousMode) {
          setTranscript('');
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        toast({
          title: "Recognition Error",
          description: `Error: ${event.error}. Please try again.`,
          variant: "destructive"
        });
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      if (continuousMode && recognitionRef.current) {
        // Restart in continuous mode
        setTimeout(() => {
          try {
            recognition.start();
          } catch (e) {
            console.log('Recognition already started');
          }
        }, 100);
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start recognition:', e);
    }
  }, [isSupported, continuousMode, processCommand, toast]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setContinuousMode(false);
  }, []);

  const toggleContinuousMode = () => {
    if (continuousMode) {
      stopListening();
    } else {
      setContinuousMode(true);
      startListening();
    }
  };

  const quickCommands = [
    { text: '"Start scan"', icon: '🎯' },
    { text: '"Take attendance"', icon: '✅' },
    { text: '"Show stats"', icon: '📊' },
    { text: '"Confirm"', icon: '👍' },
  ];

  if (!isSupported) {
    return (
      <div className="rounded-xl bg-muted/30 border border-border p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">Voice commands not supported in this browser</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Command className="w-5 h-5 text-primary" />
          <span className="font-medium text-sm">Voice Commands</span>
          <Badge className="bg-success/10 text-success border-success/20 text-xs">
            Active
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Continuous mode toggle */}
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleContinuousMode}
            className={`gap-1.5 ${continuousMode ? 'text-success' : 'text-muted-foreground'}`}
          >
            <Settings2 className="w-4 h-4" />
            <span className="hidden sm:inline text-xs">
              {continuousMode ? 'Always On' : 'Push to Talk'}
            </span>
          </Button>

          {/* Main listen button */}
          <Button
            size="sm"
            variant={isListening ? "destructive" : "default"}
            onClick={isListening ? stopListening : startListening}
            className="gap-2 min-w-[100px]"
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing
              </>
            ) : isListening ? (
              <>
                <MicOff className="w-4 h-4" />
                Stop
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                Listen
              </>
            )}
          </Button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isListening && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <Volume2 className="w-5 h-5 text-primary" />
              </motion.div>
              <div className="flex-1">
                <p className="text-sm font-medium text-primary">
                  {transcript ? 'Heard:' : 'Listening...'}
                </p>
                {transcript && (
                  <p className="text-sm text-foreground font-medium">{transcript}</p>
                )}
              </div>
              
              {/* Sound wave visualization */}
              <div className="flex gap-0.5 items-center h-6">
                {[1, 2, 3, 4, 5].map(i => (
                  <motion.div
                    key={i}
                    className="w-1 bg-primary rounded-full"
                    animate={{ 
                      height: ['8px', '24px', '8px'],
                    }}
                    transition={{ 
                      duration: 0.5 + (i * 0.1), 
                      repeat: Infinity, 
                      delay: i * 0.1 
                    }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {recognizedCommand && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="mb-4 p-3 rounded-lg bg-success/10 border border-success/20"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <span className="text-sm font-medium text-success">
                Command recognized: {recognizedCommand}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick command hints */}
      <div className="flex flex-wrap gap-2">
        {quickCommands.map((cmd, i) => (
          <motion.div 
            key={i} 
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-background/50 text-xs border border-border/50"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <span>{cmd.icon}</span>
            <span className="font-medium">{cmd.text}</span>
          </motion.div>
        ))}
      </div>

      {/* Help text */}
      <p className="text-xs text-muted-foreground mt-3">
        💡 Tip: Say "Help" to see all available commands. Works best in Chrome.
      </p>
    </div>
  );
};

export default VoiceCommands;
