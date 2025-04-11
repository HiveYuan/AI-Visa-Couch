"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { createSpeechRecognizer, SpeechRecognizer } from "@/aisdk/speech";
import { Mic, MicOff } from "lucide-react";

// 定义组件属性
interface SpeechInputProps {
  onResult: (text: string) => void;
  recognizerType?: 'web' | 'openai' | 'google';
  apiKey?: string;
  language?: string;
  disabled?: boolean;
}

export function SpeechInput({
  onResult,
  recognizerType = 'web',
  apiKey,
  language = 'zh-CN',
  disabled = false
}: SpeechInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [recognizer, setRecognizer] = useState<SpeechRecognizer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interimText, setInterimText] = useState("");

  // 初始化语音识别器
  useEffect(() => {
    try {
      const config = {
        apiKey,
        language
      };

      // 创建语音识别器
      const newRecognizer = createSpeechRecognizer(recognizerType, config);
      
      // 设置结果回调
      newRecognizer.onResult((text, isFinal) => {
        if (isFinal) {
          onResult(text);
          setInterimText("");
        } else {
          setInterimText(text);
        }
      });
      
      // 设置错误回调
      newRecognizer.onError((error) => {
        console.error("语音识别错误:", error);
        setError(error.message);
        setIsListening(false);
      });
      
      setRecognizer(newRecognizer);
      
      // 清理函数
      return () => {
        if (newRecognizer.isListening()) {
          newRecognizer.stop().catch(console.error);
        }
      };
    } catch (error) {
      console.error("初始化语音识别器错误:", error);
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [recognizerType, apiKey, language, onResult]);

  // 切换语音识别开关
  const toggleListening = useCallback(async () => {
    if (!recognizer) return;
    
    try {
      if (isListening) {
        await recognizer.stop();
        setIsListening(false);
      } else {
        await recognizer.start();
        setIsListening(true);
        setError(null);
      }
    } catch (error) {
      console.error("切换语音识别状态错误:", error);
      setError(error instanceof Error ? error.message : String(error));
      setIsListening(false);
    }
  }, [recognizer, isListening]);

  // 渲染组件
  return (
    <div className="relative">
      <Button
        type="button"
        disabled={disabled || !recognizer}
        onClick={toggleListening}
        variant={isListening ? "destructive" : "outline"}
        size="icon"
        className="rounded-full h-10 w-10"
        title={isListening ? "停止语音输入" : "开始语音输入"}
      >
        {isListening ? <MicOff size={18} /> : <Mic size={18} />}
      </Button>
      
      {interimText && (
        <div className="absolute bottom-full mb-2 p-2 bg-slate-800 text-white rounded-md text-sm min-w-48 max-w-96">
          {interimText}
        </div>
      )}
      
      {error && (
        <div className="absolute bottom-full mb-2 p-2 bg-red-600 text-white rounded-md text-sm min-w-48 max-w-96">
          错误: {error}
        </div>
      )}
    </div>
  );
} 