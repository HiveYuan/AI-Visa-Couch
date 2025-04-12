"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { createSpeechRecognizer, SpeechRecognizer } from "@/aisdk/speech";
import { Mic, MicOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// 定义组件属性
interface SpeechInputProps {
  onResult: (text: string) => void;
  onSubmit?: () => void; // 添加自动提交回调
  recognizerType?: 'web' | 'openai';
  apiKey?: string;
  language?: string;
  disabled?: boolean;
  autoSubmit?: boolean; // 是否在麦克风关闭时自动提交
}

export function SpeechInput({
  onResult,
  onSubmit,
  recognizerType = 'openai', // 默认使用OpenAI
  apiKey,
  language = 'zh-CN',
  disabled = false,
  autoSubmit = true // 默认启用自动提交
}: SpeechInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [recognizer, setRecognizer] = useState<SpeechRecognizer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interimText, setInterimText] = useState("");
  const [hasRecognizedText, setHasRecognizedText] = useState(false);
  const [isStopping, setIsStopping] = useState(false); // 跟踪是否正在停止过程中
  const lastTextRef = useRef<string>(""); // 存储最后识别的文本

  // 初始化语音识别器
  useEffect(() => {
    try {
      const config = {
        apiKey: apiKey || process.env.NEXT_PUBLIC_OPENAI_API_KEY,
        language
      };

      // 创建语音识别器
      const newRecognizer = createSpeechRecognizer(recognizerType, config);
      
      // 设置结果回调
      newRecognizer.onResult((text, isFinal) => {
        if (isFinal) {
          console.log("收到语音识别结果:", text);
          lastTextRef.current = text; // 直接使用 API 返回的完整识别文本
          onResult(text);
          setInterimText("");
          setHasRecognizedText(true); // 标记已有识别结果
        } else {
          // 非最终结果，只显示提示
          setInterimText(text);
        }
      });
      
      // 设置错误回调
      newRecognizer.onError((error) => {
        console.error("语音识别错误:", error);
        setError(error.message);
        setIsListening(false);
        setIsStopping(false);
      });
      
      // 设置停止回调
      newRecognizer.onStopped(() => {
        console.log("语音识别已完全停止");
        setIsListening(false);
        setIsStopping(false);
        
        // 在停止录音后，如果启用了自动提交，则触发提交
        if (autoSubmit && onSubmit) {
          // 确保有识别结果才提交
          if (hasRecognizedText && lastTextRef.current.trim()) {
            console.log("语音识别完全停止，自动提交最后结果:", lastTextRef.current);
            // 使用setTimeout确保状态更新后再提交
            setTimeout(() => {
              onSubmit();
            }, 0);
            setHasRecognizedText(false); // 重置标记
          } else {
            console.log("语音识别完全停止，但没有识别到文本，不提交");
          }
        }
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
  }, [recognizerType, apiKey, language, onResult, autoSubmit, onSubmit]);

  // 切换语音识别开关
  const toggleListening = useCallback(async () => {
    if (!recognizer) return;
    
    try {
      if (isListening) {
        // 防止重复停止
        if (isStopping) return;
        
        setIsStopping(true);
        setInterimText("正在处理录音...");
        console.log("开始停止语音识别...");
        await recognizer.stop();
        // 不在这里设置isListening和触发onSubmit
        // 这将在onStopped回调中完成
      } else {
        setHasRecognizedText(false); // 重置标记
        lastTextRef.current = ""; // 清空上次的文本
        setInterimText("");
        await recognizer.start();
        setIsListening(true);
        setError(null);
      }
    } catch (error) {
      console.error("切换语音识别状态错误:", error);
      setError(error instanceof Error ? error.message : String(error));
      setIsListening(false);
      setIsStopping(false);
    }
  }, [recognizer, isListening, isStopping]);

  // 渲染组件
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
              title={isListening ? "停止语音输入" : "开始语音输入"}
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
                处理中...
              </div>
            )}
            
            {error && (
              <div className="absolute bottom-full mb-2 p-2 bg-red-600 text-white rounded-md text-sm min-w-48 max-w-96">
                错误: {error}
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isListening ? "点击停止语音输入" : "开始语音输入"}</p>
          {isListening && recognizerType === 'openai' && (
            <p className="text-xs mt-1">持续收听中 - 说完后点击停止</p>
          )}
          {autoSubmit && (
            <p className="text-xs mt-1">停止后将自动发送文本</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
} 