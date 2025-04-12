"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { createSpeechRecognizer, SpeechRecognizer } from "@/aisdk/speech";
import { Mic, MicOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Define component props
interface SpeechInputProps {
  onResult: (text: string) => void;
  onSubmit?: () => void; // Callback for auto-submit
  recognizerType?: 'web' | 'openai';
  apiKey?: string;
  language?: string;
  disabled?: boolean;
  autoSubmit?: boolean; // Whether to auto-submit when microphone is closed
}

export function SpeechInput({
  onResult,
  onSubmit,
  recognizerType = 'openai', // Default to using OpenAI
  apiKey,
  language = 'en-US', // Default to English
  disabled = false,
  autoSubmit = true // Default enable auto-submit
}: SpeechInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [recognizer, setRecognizer] = useState<SpeechRecognizer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interimText, setInterimText] = useState("");
  const [hasRecognizedText, setHasRecognizedText] = useState(false);
  const [isStopping, setIsStopping] = useState(false); // Track if we're in the stopping process
  const lastTextRef = useRef<string>(""); // Store the last recognized text

  // Initialize speech recognizer
  useEffect(() => {
    try {
      const config = {
        apiKey: apiKey || process.env.NEXT_PUBLIC_OPENAI_API_KEY,
        language
      };

      // Create speech recognizer
      const newRecognizer = createSpeechRecognizer(recognizerType, config);
      
      // Set result callback
      newRecognizer.onResult((text, isFinal) => {
        if (isFinal) {
          console.log("Received speech recognition result:", text);
          lastTextRef.current = text; // Directly use API's complete recognition text
          onResult(text);
          setInterimText("");
          setHasRecognizedText(true); // Mark that we have recognized text
        } else {
          // Non-final result, just show prompt
          setInterimText(text);
        }
      });
      
      // Set error callback
      newRecognizer.onError((error) => {
        console.error("Speech recognition error:", error);
        setError(error.message);
        setIsListening(false);
        setIsStopping(false);
      });
      
      // Set stopped callback
      newRecognizer.onStopped(() => {
        console.log("Speech recognition fully stopped");
        setIsListening(false);
        setIsStopping(false);
        
        // After stopping recording, if auto-submit is enabled, trigger submission
        if (autoSubmit && onSubmit) {
          // Ensure we have recognized text before submitting
          if (hasRecognizedText && lastTextRef.current.trim()) {
            console.log("Speech recognition fully stopped, auto-submitting last result:", lastTextRef.current);
            // Use setTimeout to ensure state is updated before submitting
            setTimeout(() => {
              onSubmit();
            }, 0);
            setHasRecognizedText(false); // Reset flag
          } else {
            console.log("Speech recognition fully stopped, but no text was recognized, not submitting");
          }
        }
      });
      
      setRecognizer(newRecognizer);
      
      // Cleanup function
      return () => {
        if (newRecognizer.isListening()) {
          newRecognizer.stop().catch(console.error);
        }
      };
    } catch (error) {
      console.error("Error initializing speech recognizer:", error);
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [recognizerType, apiKey, language, onResult, autoSubmit, onSubmit]);

  // Toggle speech recognition
  const toggleListening = useCallback(async () => {
    if (!recognizer) return;
    
    try {
      if (isListening) {
        // Prevent duplicate stops
        if (isStopping) return;
        
        setIsStopping(true);
        setInterimText("Processing recording...");
        console.log("Starting to stop speech recognition...");
        await recognizer.stop();
        // Don't set isListening and trigger onSubmit here
        // This will be done in the onStopped callback
      } else {
        setHasRecognizedText(false); // Reset flag
        lastTextRef.current = ""; // Clear previous text
        setInterimText("");
        await recognizer.start();
        setIsListening(true);
        setError(null);
      }
    } catch (error) {
      console.error("Error toggling speech recognition state:", error);
      setError(error instanceof Error ? error.message : String(error));
      setIsListening(false);
      setIsStopping(false);
    }
  }, [recognizer, isListening, isStopping]);

  // Render component
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative">
            <Button
              type="button"
              disabled={disabled || !recognizer || isStopping}
              onClick={toggleListening}
              variant={isListening ? "destructive" : "outline"}
              size="icon"
              className="rounded-full h-10 w-10"
              title={isListening ? "Stop voice input" : "Start voice input"}
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </Button>
            
            {interimText && (
              <div className="absolute bottom-full mb-2 p-2 bg-slate-800 text-white rounded-md text-sm min-w-48 max-w-96">
                {interimText}
              </div>
            )}
            
            {isStopping && (
              <div className="absolute bottom-full mb-2 p-2 bg-amber-600 text-white rounded-md text-sm min-w-48 max-w-96">
                Processing...
              </div>
            )}
            
            {error && (
              <div className="absolute bottom-full mb-2 p-2 bg-red-600 text-white rounded-md text-sm min-w-48 max-w-96">
                Error: {error}
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isListening ? "Click to stop voice input" : "Start voice input"}</p>
          {isListening && recognizerType === 'openai' && (
            <p className="text-xs mt-1">Listening continuously - click stop when finished</p>
          )}
          {autoSubmit && (
            <p className="text-xs mt-1">Will auto-send text after stopping</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
} 