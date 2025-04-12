"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { VolumeX, Volume2, Pause, Play } from "lucide-react";

// 定义组件属性
interface SpeechOutputProps {
  text: string;
  autoplay?: boolean;
  language?: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  disabled?: boolean;
  showButton?: boolean;
  useOpenAI?: boolean;
  apiKey?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

export function SpeechOutput({
  text,
  autoplay = false,
  language = 'zh-CN',
  voice,
  rate = 1.0,
  pitch = 1.0,
  volume = 1.0,
  disabled = false,
  showButton = true,
  useOpenAI = true, // 默认使用OpenAI TTS
  apiKey = '', // 不再需要前端提供API密钥
  onStart,
  onEnd,
  onError
}: SpeechOutputProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const playedRef = useRef<boolean>(false); // 跟踪是否已播放过
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const playRequestRef = useRef<boolean>(false); // 防止多次播放请求

  // 初始化浏览器语音合成器
  useEffect(() => {
    if (useOpenAI) return; // 如果使用OpenAI，则不初始化浏览器语音合成

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setError('浏览器不支持语音合成');
      return;
    }

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        // 尝试找到匹配语言的声音
        let matchedVoice = null;
        
        // 如果指定了特定声音，优先使用
        if (voice) {
          matchedVoice = voices.find(v => v.name === voice);
        }
        
        // 否则找匹配语言的声音
        if (!matchedVoice) {
          matchedVoice = voices.find(v => v.lang.startsWith(language) && v.localService) ||
                        voices.find(v => v.lang.startsWith(language));
        }
        
        // 如果没有匹配的，使用默认
        setSelectedVoice(matchedVoice || voices[0]);
      }
    };
    
    // 加载可用的声音
    loadVoices();
    
    // 某些浏览器需要等待声音加载
    if ('onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    // 清理函数
    return () => {
      if (isSpeaking && !useOpenAI) {
        window.speechSynthesis.cancel();
      }
      
      // 移除事件监听器以防止内存泄漏
      if (utteranceRef.current) {
        utteranceRef.current.onstart = null;
        utteranceRef.current.onend = null;
        utteranceRef.current.onerror = null;
      }
    };
  }, [language, voice, isSpeaking, useOpenAI]);

  // 清理音频资源
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        URL.revokeObjectURL(audioRef.current.src);
      }
    };
  }, []);

  // 当文本变化时重置播放状态
  useEffect(() => {
    // 文本变化时重置播放状态
    playedRef.current = false;
    
    // 如果正在播放，停止
    if (isSpeaking) {
      if (useOpenAI && audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        setIsSpeaking(false);
      } else if (!useOpenAI && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }
    }
  }, [text, useOpenAI, isSpeaking]);

  // 设置Web Speech API发声实例
  useEffect(() => {
    if (useOpenAI || !text || typeof window === 'undefined' || !window.speechSynthesis) return;
    
    // 移除任何现有的语音实例
    if (utteranceRef.current) {
      utteranceRef.current.onstart = null;
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
    }
    
    // 创建新的语音实例
    const newUtterance = new SpeechSynthesisUtterance(text);
    newUtterance.lang = language;
    
    if (selectedVoice) {
      newUtterance.voice = selectedVoice;
    }
    
    newUtterance.rate = rate;
    newUtterance.pitch = pitch;
    newUtterance.volume = volume;
    
    newUtterance.onstart = () => {
      console.log("开始播放语音");
      setIsSpeaking(true);
      if (onStart) onStart();
    };
    
    newUtterance.onend = () => {
      console.log("语音播放结束");
      setIsSpeaking(false);
      playedRef.current = true; // 标记为已播放
      if (onEnd) onEnd();
    };
    
    newUtterance.onerror = (event) => {
      console.error("语音播放错误:", event);
      setIsSpeaking(false);
      const errorMsg = `语音合成错误: ${event.error || '未知错误'}`;
      setError(errorMsg);
      if (onError) onError(new Error(errorMsg));
    };
    
    utteranceRef.current = newUtterance;
  }, [text, language, selectedVoice, rate, pitch, volume, onStart, onEnd, onError, useOpenAI]);

  // 当鼠标悬停时自动播放，添加防抖功能
  useEffect(() => {
    if (text && autoplay && !isSpeaking && !disabled && !playedRef.current && !isLoading && !playRequestRef.current) {
      // 设置标志，防止重复请求
      playRequestRef.current = true;
      
      // 使用setTimeout来防抖，确保不会发出太多播放请求
      const timer = setTimeout(() => {
        if ((useOpenAI) || (!useOpenAI && utteranceRef.current)) {
          try {
            handleSpeak();
          } catch (err) {
            console.error("触发音频播放时出错:", err);
            setError("触发音频播放失败");
          }
        }
        playRequestRef.current = false;
      }, 300);
      
      return () => {
        clearTimeout(timer);
        playRequestRef.current = false;
      };
    }
  }, [text, autoplay, isSpeaking, disabled, isLoading, useOpenAI]);

  // 使用OpenAI TTS API生成语音
  const handleOpenAITTS = async () => {
    // 尝试格式列表，如果一种格式失败会尝试下一种
    const formatOptions = ['wav', 'mp3'];
    let lastError = null;

    try {
      // 确保之前的播放已经停止
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        URL.revokeObjectURL(audioRef.current.src);
        audioRef.current = null;
      }

      setIsLoading(true);
      setError(null);
      
      // 用于选择合适的声音
      const openAIVoice = voice || 'alloy';
      
      // 首先尝试使用data URL方式（通常兼容性更好）
      try {
        console.log(`尝试请求OpenAI TTS API，使用base64 data URL方式`);
        
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            voice: openAIVoice,
            format: 'mp3',
            outputType: 'base64'
          }),
        });

        if (!response.ok) {
          throw new Error(`API错误 ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.success || !data.dataUrl) {
          throw new Error('API返回无效数据');
        }
        
        console.log(`收到音频base64数据，大小：${data.size}字节，格式：${data.format}`);
        
        // 直接创建音频元素并使用data URL播放
        const audio = new Audio(data.dataUrl);
        audio.volume = volume;
        
        if ('playbackRate' in audio) {
          audio.playbackRate = rate;
        }
        
        // 设置事件处理程序
        audio.onplay = () => {
          console.log("开始播放OpenAI语音（base64）");
          setIsSpeaking(true);
          if (onStart) onStart();
        };
        
        audio.onended = () => {
          console.log("OpenAI语音播放结束");
          setIsSpeaking(false);
          playedRef.current = true;
          if (onEnd) onEnd();
        };
        
        audio.onerror = (e) => {
          // 获取更详细的错误信息
          const errorDetails = audio.error ? 
            `代码=${audio.error.code}, 消息=${audio.error.message || '无详细信息'}` : 
            '未知错误';
          console.error("Data URL音频播放错误:", errorDetails);
          setIsSpeaking(false);
          setError("Data URL音频播放失败");
          if (onError) onError(new Error(`Data URL音频播放失败: ${errorDetails}`));
          
          // base64失败时不要中断执行，让它继续尝试其他方法
          throw new Error(`Data URL播放失败: ${errorDetails}`);
        };
        
        // 尝试播放
        try {
          // 使用专门的函数来处理播放，添加重试机制
          const tryPlayAudio = async (audioElement: HTMLAudioElement, maxRetries = 3) => {
            let retries = 0;
            while (retries < maxRetries) {
              try {
                console.log(`尝试播放Audio (尝试 ${retries + 1}/${maxRetries})`);
                await audioElement.play();
                console.log("Audio播放成功");
                return true; // 播放成功
              } catch (playErr) {
                retries++;
                console.warn(`播放失败 (${retries}/${maxRetries}):`, playErr);
                if (retries >= maxRetries) {
                  throw playErr; // 重试次数用完，抛出错误
                }
                // 等待一段时间再重试
                await new Promise(resolve => setTimeout(resolve, 300));
              }
            }
            return false;
          };
          
          await tryPlayAudio(audio);
          // 如果播放成功，则保存引用并返回
          audioRef.current = audio;
          return;
        } catch (playError) {
          console.error("Data URL播放失败:", playError);
          throw playError;
        }
      } catch (base64Error) {
        console.warn("Base64方式播放失败，尝试其他方式:", base64Error);
      }
      
      // 如果data URL方式失败，尝试不同的音频格式
      for (const format of formatOptions) {
        try {
          console.log(`尝试请求OpenAI TTS API，格式: ${format}, 文本长度: ${text.length}字符，声音: ${openAIVoice}`);
          
          const response = await fetch('/api/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text,
              voice: openAIVoice,
              format
            }),
          });

          if (!response.ok) {
            let errorData;
            try {
              errorData = await response.json();
            } catch (e) {
              errorData = { error: `HTTP错误 ${response.status}` };
            }
            
            throw new Error(`OpenAI TTS API错误: ${response.status} ${response.statusText} - ${errorData.error || ''}`);
          }

          // 获取音频blob
          const audioBlob = await response.blob();
          
          if (audioBlob.size === 0) {
            throw new Error('接收到空的音频数据');
          }
          
          console.log(`收到音频数据：${audioBlob.size}字节，类型：${audioBlob.type}，格式：${format}`);
          
          // 强制设置正确的MIME类型
          const contentType = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
          const newBlob = new Blob([await audioBlob.arrayBuffer()], { type: contentType });
          const url = URL.createObjectURL(newBlob);
          
          // 创建一个测试音频元素验证兼容性
          const testAudio = new Audio();
          
          // 设置测试超时
          const canPlayPromise = new Promise<boolean>((resolve) => {
            // 如果能播放，返回true
            testAudio.addEventListener('canplaythrough', () => {
              console.log(`格式${format}可以播放`);
              resolve(true);
            }, { once: true });
            
            // 如果有错误，返回false
            testAudio.addEventListener('error', () => {
              console.log(`格式${format}不支持播放`);
              resolve(false);
            }, { once: true });
            
            // 设置超时
            setTimeout(() => {
              console.log(`格式${format}测试超时`);
              resolve(false);
            }, 2000);
          });
          
          // 设置源并加载
          testAudio.src = url;
          testAudio.load();
          
          // 等待测试结果
          const canPlay = await canPlayPromise;
          
          // 清理测试资源
          testAudio.src = '';
          
          if (canPlay) {
            // 如果可以播放，则创建并配置音频元素
            await setupAndPlayAudio(url, newBlob.size, contentType, format);
            return; // 成功播放，退出函数
          } else {
            // 如果不能播放，释放资源并尝试下一个格式
            URL.revokeObjectURL(url);
            throw new Error(`浏览器不支持${format}格式`);
          }
        } catch (formatError) {
          console.warn(`使用${format}格式失败:`, formatError);
          lastError = formatError;
          // 继续尝试下一个格式
        }
      }
      
      // 如果所有格式都失败，抛出最后的错误
      throw new Error(`所有音频格式尝试失败: ${lastError instanceof Error ? lastError.message : '未知错误'}`);
    } catch (error) {
      console.error("OpenAI TTS错误:", error);
      setError(error instanceof Error ? error.message : String(error));
      if (onError) onError(error instanceof Error ? error : new Error(String(error)));
      setIsSpeaking(false);
    } finally {
      setIsLoading(false);
    }
  };

  // 创建音频元素并播放
  const setupAndPlayAudio = async (url: string, size: number, contentType: string, format: string) => {
    // 创建新的音频元素
    const audio = new Audio();
    let loadingStartTime = Date.now();
    
    // 先设置所有事件监听器，再设置src，再播放
    audio.preload = 'auto'; // 强制预加载
    audio.volume = volume;
    
    if ('playbackRate' in audio) {
      audio.playbackRate = rate;
    }
    
    // 设置事件处理程序
    audio.onplay = () => {
      console.log(`开始播放OpenAI语音(${format})，加载耗时:`, Date.now() - loadingStartTime, "ms");
      setIsSpeaking(true);
      if (onStart) onStart();
    };
    
    audio.onended = () => {
      console.log("OpenAI语音播放结束");
      setIsSpeaking(false);
      playedRef.current = true;
      URL.revokeObjectURL(url);
      if (onEnd) onEnd();
    };
    
    audio.onerror = (e) => {
      // 获取最详细的错误信息
      let errorMessage = '未知错误';
      
      if (audio.error) {
        // 标准MediaError错误码
        const errorCodes: Record<number, string> = {
          1: 'MEDIA_ERR_ABORTED - 播放被用户终止',
          2: 'MEDIA_ERR_NETWORK - 网络错误导致音频下载失败',
          3: 'MEDIA_ERR_DECODE - 解码错误，音频文件可能损坏',
          4: 'MEDIA_ERR_SRC_NOT_SUPPORTED - 音频格式不支持或资源不可用'
        };
        
        errorMessage = errorCodes[audio.error.code] || `未知错误(${audio.error.code})`;
        
        if (audio.error.message) {
          errorMessage += `: ${audio.error.message}`;
        }
      }
      
      console.error(`音频加载错误: ${errorMessage}`, e);
      
      // 尝试获取更多信息
      const audioSrc = audio.src ? (audio.src.length > 100 ? audio.src.substring(0, 50) + '...' : audio.src) : '无';
      const audioState = {
        currentSrc: audioSrc,
        readyState: audio.readyState,
        networkState: audio.networkState,
        paused: audio.paused,
        ended: audio.ended,
        muted: audio.muted,
        volume: audio.volume
      };
      
      console.log('音频元素状态:', audioState);
      
      setIsSpeaking(false);
      URL.revokeObjectURL(url);
      setError(`音频播放失败: ${errorMessage}`);
      if (onError) onError(new Error(`音频播放错误: ${errorMessage}`));
    };
    
    // 添加更多状态监听
    audio.addEventListener('waiting', () => {
      console.log("音频缓冲中...");
    });
    
    audio.addEventListener('stalled', () => {
      console.log("音频加载停滞...");
    });
    
    // 确保音频已加载后再播放
    audio.oncanplaythrough = () => {
      try {
        console.log(`音频(${format})可以流畅播放`);
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.error("播放音频失败:", error);
            setError(`播放音频失败: ${error instanceof Error ? error.message : '可能是由于浏览器策略限制'}`);
            setIsSpeaking(false);
          });
        }
      } catch (playError) {
        console.error("播放音频时发生错误:", playError);
        setError(`播放音频失败: ${playError instanceof Error ? playError.message : '未知错误'}`);
        setIsSpeaking(false);
      }
    };
    
    // 检查并添加音频加载错误处理
    audio.addEventListener('loadedmetadata', () => {
      console.log(`音频(${format})元数据已加载，时长:`, audio.duration, "秒");
    });
    
    // 设置音频源
    audio.src = url;
    audioRef.current = audio;
    
    // 加载音频但不自动播放（会触发oncanplaythrough）
    audio.load();
    
    // 设置超时，如果音频在一定时间内没有加载，则报错
    const timeoutId = setTimeout(() => {
      if (!audio.readyState) {
        console.error("音频加载超时");
        audio.onerror = null; // 移除已有的错误处理器
        setError("音频加载超时，请重试");
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        if (onError) onError(new Error("音频加载超时"));
      }
    }, 10000); // 10秒超时
    
    // 设置加载事件以清除超时
    audio.onloadeddata = () => {
      clearTimeout(timeoutId);
    };
  };

  // 播放语音
  const handleSpeak = useCallback(() => {
    // 防止重复播放请求
    if (playRequestRef.current) return;
    playRequestRef.current = true;
    
    if (useOpenAI) {
      // 如果正在播放，停止播放
      if (isSpeaking && audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        if (audioRef.current.src) {
          URL.revokeObjectURL(audioRef.current.src);
        }
        audioRef.current = null;
        setIsSpeaking(false);
        playRequestRef.current = false;
        return;
      }
      
      // 否则使用OpenAI TTS
      handleOpenAITTS();
      playRequestRef.current = false;
      return;
    }
    
    // 使用Web Speech API
    if (!utteranceRef.current || typeof window === 'undefined' || !window.speechSynthesis) {
      playRequestRef.current = false;
      return;
    }
    
    try {
      if (isSpeaking) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      } else {
        setError(null);
        
        // 确保之前的任何语音都被取消
        window.speechSynthesis.cancel();
        
        // 播放新的语音
        window.speechSynthesis.speak(utteranceRef.current);
      }
    } catch (error) {
      console.error("语音播放错误:", error);
      setError(error instanceof Error ? error.message : String(error));
      if (onError) onError(error instanceof Error ? error : new Error(String(error)));
    }
    
    playRequestRef.current = false;
  }, [isSpeaking, onError, useOpenAI, text]);

  // 渲染组件
  return (
    <div className="speech-output">
      {showButton && (
        <Button
          onClick={handleSpeak}
          variant="ghost"
          size="icon"
          disabled={disabled || isLoading}
          className="size-8 p-0 rounded-full"
          data-auto-play={autoplay ? "true" : "false"}
        >
          {isSpeaking ? (
            <Pause className="h-3 w-3" />
          ) : (
            <Play className="h-3 w-3" />
          )}
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