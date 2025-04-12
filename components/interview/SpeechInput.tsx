"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { createSpeechRecognizer, SpeechRecognizer } from "@/aisdk/speech";
import { Mic, MicOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Define component props
interface SpeechInputProps {
  onResult: (text: string) => void;
  onSubmit?: (text?: string) => void; // Callback for auto-submit with optional text param
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
  console.log('[SpeechInput] 组件初始化');
  console.log('[SpeechInput] recognizerType:', recognizerType);
  console.log('[SpeechInput] language:', language);
  console.log('[SpeechInput] autoSubmit:', autoSubmit);
  console.log('[SpeechInput] onSubmit存在:', !!onSubmit);
  console.log('[SpeechInput] onResult存在:', !!onResult);
  
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
        console.log(`[SpeechInput] onResult 回调: text=${text ? text.substring(0, 30) + "..." : "空"}, isFinal=${isFinal}`);
        setInterimText(isFinal ? "" : text);
        
        if (isFinal) {
          // For final results, we accumulate the text
          const updatedText = text.trim();
          if (updatedText) {
            // Use a callback form of lastTextRef.current to ensure we're working with the latest state
            console.log(`[SpeechInput] 接收到最终结果，更新 lastTextRef: ${updatedText.substring(0, 30)}...`);
            lastTextRef.current = updatedText;
            setHasRecognizedText(true);
            
            // Immediately call onResult with the latest text
            if (onResult) {
              console.log(`[SpeechInput] 调用父组件 onResult 回调`);
              onResult(updatedText);
              console.log(`[SpeechInput] 父组件 onResult 回调已调用`);
            }
          }
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
        console.log("[SpeechInput] Speech recognition fully stopped");
        console.log("[SpeechInput] autoSubmit:", autoSubmit);
        console.log("[SpeechInput] onSubmit callback exists:", !!onSubmit);
        console.log("[SpeechInput] hasRecognizedText:", hasRecognizedText);
        console.log("[SpeechInput] lastTextRef.current:", lastTextRef.current);
        setIsListening(false);
        setIsStopping(false);
        
        // After stopping recording, if auto-submit is enabled, trigger submission
        if (autoSubmit && onSubmit) {
          // 修改：只要有文本内容就可以提交，不严格要求hasRecognizedText标志
          if (lastTextRef.current.trim()) {
            console.log("[SpeechInput] 准备自动提交识别结果:", lastTextRef.current);
            // Use setTimeout to ensure state is updated before submitting
            setTimeout(() => {
              console.log("[SpeechInput] 正在调用onSubmit回调...");
              onSubmit(lastTextRef.current);
              console.log("[SpeechInput] onSubmit回调已调用");
            }, 0);
            setHasRecognizedText(false); // Reset flag
          } else {
            console.log("[SpeechInput] 未识别到文本或文本为空，不自动提交");
          }
        } else {
          console.log("[SpeechInput] 自动提交未启用或未提供onSubmit回调");
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
        if (isStopping) {
          console.log("[SpeechInput] 已经在停止过程中，忽略重复停止请求");
          return;
        }
        
        console.log("[SpeechInput] 开始停止语音识别...");
        setIsStopping(true);
        setInterimText("Processing recording...");
        console.log("[SpeechInput] 调用 recognizer.stop()");
        await recognizer.stop();
        console.log("[SpeechInput] recognizer.stop() 完成");

        // 备用提交机制：如果onStopped回调未被触发，这里提供一个额外保障
        // 设置一个定时器，如果500ms后仍有文本且未被提交，则触发onSubmit
        if (autoSubmit && onSubmit && lastTextRef.current.trim()) {
          console.log("[SpeechInput] 设置备用提交定时器，500ms后检查是否需要提交");
          setTimeout(() => {
            // 此时如果仍然有文本且没有被提交过，说明onStopped回调可能没触发
            if (lastTextRef.current.trim()) {
              console.log("[SpeechInput] 触发备用提交机制:", lastTextRef.current);
              onSubmit(lastTextRef.current);
            }
          }, 500);
        }

        // Don't set isListening and trigger onSubmit here
        // This will be done in the onStopped callback
      } else {
        console.log("[SpeechInput] 开始语音识别");
        setHasRecognizedText(false); // Reset flag
        lastTextRef.current = ""; // Clear previous text
        setInterimText("");
        await recognizer.start();
        setIsListening(true);
        setError(null);
        console.log("[SpeechInput] 语音识别已开始");
      }
    } catch (error) {
      console.error("[SpeechInput] 切换语音识别状态时出错:", error);
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