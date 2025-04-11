"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { createSpeechSynthesizer, SpeechSynthesizer } from "@/aisdk/speech";
import { VolumeX, Volume2 } from "lucide-react";

// 定义组件属性
interface SpeechOutputProps {
  text: string;
  autoplay?: boolean;
  synthesizerType?: 'web' | 'openai';
  apiKey?: string;
  language?: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  disabled?: boolean;
  showButton?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

export function SpeechOutput({
  text,
  autoplay = false,
  synthesizerType = 'web',
  apiKey,
  language = 'zh-CN',
  voice,
  rate = 1.0,
  pitch = 1.0,
  volume = 1.0,
  disabled = false,
  showButton = true,
  onStart,
  onEnd,
  onError
}: SpeechOutputProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [synthesizer, setSynthesizer] = useState<SpeechSynthesizer | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 初始化语音合成器
  useEffect(() => {
    try {
      const config = {
        apiKey,
        language,
        voice,
        rate,
        pitch,
        volume
      };

      // 创建语音合成器
      const newSynthesizer = createSpeechSynthesizer(
        synthesizerType,
        config
      );
      
      // 设置回调
      newSynthesizer.onStart(() => {
        setIsSpeaking(true);
        if (onStart) onStart();
      });
      
      newSynthesizer.onEnd(() => {
        setIsSpeaking(false);
        if (onEnd) onEnd();
      });
      
      newSynthesizer.onError((err) => {
        console.error("语音合成错误:", err);
        setError(err.message);
        setIsSpeaking(false);
        if (onError) onError(err);
      });
      
      setSynthesizer(newSynthesizer);
      
      // 清理函数
      return () => {
        if (newSynthesizer.isSpeaking()) {
          newSynthesizer.cancel().catch(console.error);
        }
      };
    } catch (error) {
      console.error("初始化语音合成器错误:", error);
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [synthesizerType, apiKey, language, voice, rate, pitch, volume, onStart, onEnd, onError]);

  // 当文本或自动播放属性变化时播放
  useEffect(() => {
    if (text && autoplay && synthesizer && !isSpeaking && !disabled) {
      handleSpeak();
    }
  }, [text, autoplay, synthesizer, disabled]);

  // 播放语音
  const handleSpeak = useCallback(async () => {
    if (!synthesizer || !text) return;
    
    try {
      if (isSpeaking) {
        await synthesizer.cancel();
        setIsSpeaking(false);
      } else {
        setError(null);
        await synthesizer.speak(text);
      }
    } catch (error) {
      console.error("语音播放错误:", error);
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [synthesizer, text, isSpeaking]);

  // 渲染组件
  return (
    <div className="relative">
      {showButton && (
        <Button
          type="button"
          disabled={disabled || !synthesizer || !text}
          onClick={handleSpeak}
          variant={isSpeaking ? "destructive" : "outline"}
          size="icon"
          className="rounded-full h-10 w-10"
          title={isSpeaking ? "停止播放" : "朗读文本"}
        >
          {isSpeaking ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </Button>
      )}
      
      {error && (
        <div className="absolute bottom-full mb-2 p-2 bg-red-600 text-white rounded-md text-sm min-w-48 max-w-96">
          错误: {error}
        </div>
      )}
    </div>
  );
} 