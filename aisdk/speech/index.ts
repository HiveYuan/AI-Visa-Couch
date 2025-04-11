// 为Web Speech API扩展Window接口
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

// 为了解决循环引用问题，我们只在类型中使用任何DOM类型，而不在全局命名空间中声明它们

// 这个接口定义了Web Speech API的SpeechRecognition对象
export interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  grammars: any;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

export interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

// 语音识别接口
export interface SpeechRecognizer {
  start(): Promise<void>;
  stop(): Promise<void>;
  isListening(): boolean;
  onResult(callback: (text: string, isFinal: boolean) => void): void;
  onError(callback: (error: Error) => void): void;
}

// 语音识别器配置
export interface SpeechRecognizerConfig {
  apiKey?: string;
  language?: string;
}

// Web Speech API 实现
export class WebSpeechRecognizer implements SpeechRecognizer {
  private recognition: SpeechRecognition | null = null;
  private listening = false;
  private resultCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private config: SpeechRecognizerConfig;

  constructor(config: SpeechRecognizerConfig = {}) {
    this.config = {
      language: 'zh-CN',
      ...config
    };
    this.initRecognition();
  }

  private initRecognition() {
    if (typeof window === 'undefined') return;

    try {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognitionAPI) {
        throw new Error('浏览器不支持语音识别API');
      }

      this.recognition = new SpeechRecognitionAPI();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.config.language || 'zh-CN';
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (!this.resultCallback) return;
        
        const result = event.results[event.resultIndex];
        const transcript = result[0].transcript;
        const isFinal = result.isFinal;
        
        this.resultCallback(transcript, isFinal);
      };

      this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (this.errorCallback) {
          let errorMessage = '语音识别错误';
          
          if (event.error) {
            switch (event.error) {
              case 'network':
                errorMessage = '网络连接问题，请检查您的互联网连接';
                break;
              case 'not-allowed':
              case 'permission-denied':
                errorMessage = '麦克风访问被拒绝，请允许浏览器访问您的麦克风';
                break;
              case 'no-speech':
                errorMessage = '未检测到语音';
                break;
              case 'aborted':
                errorMessage = '语音识别被中止';
                break;
              case 'audio-capture':
                errorMessage = '无法捕获音频';
                break;
              case 'service-not-allowed':
                errorMessage = '浏览器不允许使用语音识别服务';
                break;
              case 'bad-grammar':
                errorMessage = '语法识别错误';
                break;
              case 'language-not-supported':
                errorMessage = '不支持所选语言';
                break;
              default:
                errorMessage = `语音识别错误: ${event.error}`;
            }
          }
          
          if (event.message) {
            errorMessage = event.message;
          }
          
          this.errorCallback(new Error(errorMessage));
        }
      };

      this.recognition.onend = () => {
        this.listening = false;
      };
      
    } catch (error) {
      console.error('初始化语音识别时出错:', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    if (!this.recognition) {
      throw new Error('语音识别未初始化');
    }

    if (this.listening) {
      return;
    }

    try {
      this.recognition.start();
      this.listening = true;
    } catch (error) {
      this.listening = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.recognition || !this.listening) {
      return;
    }

    try {
      this.recognition.stop();
      this.listening = false;
    } catch (error) {
      throw error;
    }
  }

  isListening(): boolean {
    return this.listening;
  }

  onResult(callback: (text: string, isFinal: boolean) => void): void {
    this.resultCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }
}

// OpenAI Whisper API 实现
export class OpenAIRecognizer implements SpeechRecognizer {
  private listening = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private resultCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private apiKey: string;
  private language: string;
  private recognitionTimer: NodeJS.Timeout | null = null;
  private stream: MediaStream | null = null;
  private userStopped = false;

  constructor(apiKey: string, language: string = 'zh') {
    this.apiKey = apiKey;
    // 确保语言代码符合ISO-639-1格式（只保留主语言代码）
    this.language = language.split('-')[0].toLowerCase();
  }

  async start(): Promise<void> {
    if (this.listening) return;
    
    // 重置用户停止标志
    this.userStopped = false;

    try {
      // 获取麦克风权限
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        if (this.audioChunks.length > 0) {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          
          // 只有当用户明确停止时才处理音频，避免自动停止的重复处理
          if (this.userStopped) {
            await this.processAudio(audioBlob);
            this.audioChunks = []; // 清空音频块
          }
          
          // 如果不是用户主动停止，并且仍处于监听状态，则重新开始录音
          if (!this.userStopped && this.listening) {
            this.restartRecording();
          }
        }
      };

      this.mediaRecorder.start(1000); // 每秒收集一次数据
      this.listening = true;

      // 设置自动停止和重新开始录音的计时器 (10秒)
      this.startPeriodicRecognition();
    } catch (error) {
      console.error('启动OpenAI语音识别时出错:', error);
      if (this.errorCallback) {
        this.errorCallback(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  async stop(): Promise<void> {
    this.userStopped = true; // 标记为用户主动停止
    
    if (!this.listening) return;
    
    // 清除任何活动的计时器
    this.clearRecognitionTimer();

    try {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }

      // 关闭并释放媒体流
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }

      this.listening = false;
    } catch (error) {
      console.error('停止OpenAI语音识别时出错:', error);
      throw error;
    }
  }

  isListening(): boolean {
    return this.listening;
  }

  onResult(callback: (text: string, isFinal: boolean) => void): void {
    this.resultCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  private startPeriodicRecognition(): void {
    // 清除任何现有的计时器
    this.clearRecognitionTimer();
    
    // 创建新的计时器，每10秒自动停止并重新开始录音
    this.recognitionTimer = setTimeout(() => {
      if (this.listening && this.mediaRecorder) {
        if (this.mediaRecorder.state !== 'inactive') {
          console.log('自动停止录音以进行处理...');
          this.mediaRecorder.stop();
          // 在onstop事件中处理重新启动
        }
      }
    }, 10000);
  }

  private clearRecognitionTimer(): void {
    if (this.recognitionTimer) {
      clearTimeout(this.recognitionTimer);
      this.recognitionTimer = null;
    }
  }

  private restartRecording(): void {
    try {
      // 确保MediaRecorder已停止
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        return; // 如果仍在录制，不要重新启动
      }
      
      console.log('重新启动录音...');
      
      // 使用现有的媒体流重新创建MediaRecorder
      if (this.stream) {
        this.mediaRecorder = new MediaRecorder(this.stream);
        this.audioChunks = []; // 清空音频块
        
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };
        
        this.mediaRecorder.onstop = async () => {
          if (this.audioChunks.length > 0) {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            
            // 只有当用户明确停止时才处理音频
            if (this.userStopped) {
              await this.processAudio(audioBlob);
              this.audioChunks = []; // 清空音频块
            }
            
            // 如果不是用户主动停止，并且仍处于监听状态，则重新开始录音
            if (!this.userStopped && this.listening) {
              this.restartRecording();
            }
          }
        };
        
        // 开始新的录制
        this.mediaRecorder.start(1000);
        
        // 重新设置计时器
        this.startPeriodicRecognition();
      }
    } catch (error) {
      console.error('重新启动录音时出错:', error);
      if (this.errorCallback) {
        this.errorCallback(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  private async processAudio(audioBlob: Blob): Promise<void> {
    try {
      console.log(`处理音频数据，大小: ${audioBlob.size} 字节, 类型: ${audioBlob.type}`);
      if (audioBlob.size < 1000) {
        console.log("音频数据太小，跳过处理");
        return; // 如果音频太小，可能没有有用的内容
      }
      
      // 确保我们有正确的MIME类型
      let processedBlob = audioBlob;
      if (!audioBlob.type.includes('audio/')) {
        console.log("修正音频MIME类型为audio/webm");
        processedBlob = new Blob([await audioBlob.arrayBuffer()], { type: 'audio/webm' });
      }
      
      const formData = new FormData();
      formData.append('file', processedBlob, 'recording.webm');
      formData.append('language', this.language); // 已经确保是ISO-639-1格式
      formData.append('model', 'whisper-1'); // 确保包含model参数

      // 使用自定义API端点而不是直接调用OpenAI API
      let response;
      let error = null;
      
      // 先尝试使用自定义API
      try {
        console.log("尝试使用服务器端API进行语音识别...");
        response = await fetch('/api/speech-recognize', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          error = new Error(`服务器API错误: ${response.status} ${response.statusText}${errorData ? ` - ${errorData.error || ''}` : ''}`);
          console.error("服务器API错误:", error);
          // 不立即抛出，继续尝试直接API
        }
      } catch (apiError) {
        console.error('无法连接到服务器API:', apiError);
        error = apiError;
        // 不立即抛出，继续尝试直接API
      }
      
      // 如果服务器API成功，处理结果
      if (response && response.ok) {
        const data = await response.json();
        if (data.text && this.resultCallback) {
          const transcript = data.text.trim();
          if (transcript) {
            console.log(`获取到语音识别结果: "${transcript}"`);
            this.resultCallback(transcript, true);
            return; // 成功返回
          } else {
            console.log("收到空的识别结果");
          }
        }
      }
      
      // 如果服务器API失败，尝试直接调用OpenAI API
      if (!this.apiKey) {
        // 如果没有API密钥，抛出之前保存的错误或新错误
        throw error || new Error('未提供OpenAI API密钥，无法进行语音识别');
      }
      
      console.log("尝试直接调用OpenAI API...");
      const directFormData = new FormData();
      directFormData.append('file', processedBlob, 'recording.webm');
      directFormData.append('model', 'whisper-1'); // 必须提供model参数
      directFormData.append('language', this.language);
      
      const directResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: directFormData
      });

      if (!directResponse.ok) {
        const errorData = await directResponse.json().catch(() => ({}));
        throw new Error(`OpenAI API错误: ${directResponse.status} ${directResponse.statusText}${errorData.error ? ` - ${errorData.error.message || ''}` : ''}`);
      }

      const data = await directResponse.json();
      if (data.text && this.resultCallback) {
        const transcript = data.text.trim();
        if (transcript) {
          console.log(`获取到语音识别结果: "${transcript}"`);
          this.resultCallback(transcript, true);
        } else {
          console.log("收到空的识别结果");
        }
      }
    } catch (error) {
      console.error('处理音频时出错:', error);
      if (this.errorCallback) {
        this.errorCallback(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}

// Google Cloud Speech-to-Text API 实现
export class GoogleSpeechRecognizer implements SpeechRecognizer {
  private listening = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private resultCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private apiKey: string;
  private language: string;

  constructor(apiKey: string, language: string = 'zh-CN') {
    this.apiKey = apiKey;
    this.language = language;
  }

  async start(): Promise<void> {
    if (this.listening) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        if (this.audioChunks.length > 0) {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
          await this.processAudio(audioBlob);
        }
      };

      this.mediaRecorder.start(1000); // 每秒收集一次数据
      this.listening = true;

      // 定期发送音频进行识别
      this.startPeriodicRecognition();
    } catch (error) {
      console.error('错误启动Google语音识别:', error);
      if (this.errorCallback) {
        this.errorCallback(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  private startPeriodicRecognition() {
    // 每5秒处理一次收集的音频
    const intervalId = setInterval(async () => {
      if (!this.listening || !this.mediaRecorder) {
        clearInterval(intervalId);
        return;
      }

      if (this.audioChunks.length > 0) {
        // 暂停录制，处理当前音频，然后继续
        this.mediaRecorder.pause();
        const currentChunks = [...this.audioChunks];
        this.audioChunks = [];
        
        const audioBlob = new Blob(currentChunks, { type: 'audio/webm' });
        await this.processAudio(audioBlob);
        
        if (this.listening && this.mediaRecorder.state !== 'recording') {
          this.mediaRecorder.resume();
        }
      }
    }, 5000);
  }

  async stop(): Promise<void> {
    if (!this.listening || !this.mediaRecorder) return;

    this.listening = false;
    try {
      this.mediaRecorder.stop();
      // 停止所有轨道
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
      this.mediaRecorder = null;
    } catch (error) {
      console.error('错误停止Google语音识别:', error);
      if (this.errorCallback) {
        this.errorCallback(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  isListening(): boolean {
    return this.listening;
  }

  onResult(callback: (text: string, isFinal: boolean) => void): void {
    this.resultCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  private async processAudio(audioBlob: Blob): Promise<void> {
    try {
      // 将Blob转换为Base64
      const buffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(
        new Uint8Array(buffer).reduce(
          (data, byte) => data + String.fromCharCode(byte), ''
        )
      );

      const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          config: {
            encoding: 'WEBM_OPUS',
            sampleRateHertz: 48000,
            languageCode: this.language,
            enableAutomaticPunctuation: true,
          },
          audio: {
            content: base64Audio
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Google API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (data.results && data.results.length > 0 && this.resultCallback) {
        const transcript = data.results.map((result: any) => 
          result.alternatives[0].transcript).join(' ');
        this.resultCallback(transcript, true);
      }
    } catch (error) {
      console.error('处理音频时出错:', error);
      if (this.errorCallback) {
        this.errorCallback(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}

// 语音识别工厂，根据配置创建不同的实现
export function createSpeechRecognizer(
  type: 'web' | 'openai' | 'google' = 'web',
  config: SpeechRecognizerConfig = {}
): SpeechRecognizer {
  switch (type) {
    case 'openai':
      if (!config.apiKey) {
        throw new Error('OpenAI需要提供API Key');
      }
      return new OpenAIRecognizer(config.apiKey, config.language || 'zh');
    case 'google':
      if (!config.apiKey) {
        throw new Error('Google Speech-to-Text需要提供API Key');
      }
      return new GoogleSpeechRecognizer(config.apiKey, config.language || 'zh-CN');
    case 'web':
    default:
      return new WebSpeechRecognizer(config);
  }
}

// ==================== 语音合成接口 ====================

// 不再导出冲突的内置类型接口定义

// 语音合成器配置
export interface SpeechSynthesizerConfig {
  apiKey?: string;
  language?: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

// 语音合成器接口
export interface SpeechSynthesizer {
  speak(text: string): Promise<void>;
  cancel(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  isSpeaking(): boolean;
  getVoices(): Promise<any[]>;
  setVoice(voice: any | string): void;
  setLanguage(language: string): void;
  setRate(rate: number): void;
  setPitch(pitch: number): void;
  setVolume(volume: number): void;
  onStart(callback: () => void): void;
  onEnd(callback: () => void): void;
  onError(callback: (error: Error) => void): void;
}

// Web Speech API TTS实现
export class WebSpeechSynthesizer implements SpeechSynthesizer {
  private synthesis: any = null;
  private utterance: any = null;
  private config: SpeechSynthesizerConfig;
  private voice: any = null;
  private speaking = false;
  private onStartCallback: (() => void) | null = null;
  private onEndCallback: (() => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;

  constructor(config: SpeechSynthesizerConfig = {}) {
    this.config = {
      language: 'zh-CN',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      ...config
    };
    this.initSynthesis();
  }

  private initSynthesis() {
    if (typeof window === 'undefined') return;

    try {
      if (!window.speechSynthesis) {
        throw new Error('浏览器不支持语音合成API');
      }

      this.synthesis = window.speechSynthesis;

      // 尝试获取匹配语言的声音
      this.loadVoices();
      
      // 某些浏览器需要等待声音加载
      if (this.synthesis && 'onvoiceschanged' in this.synthesis) {
        this.synthesis.onvoiceschanged = () => this.loadVoices();
      }
    } catch (error) {
      console.error('初始化语音合成时出错:', error);
      throw error;
    }
  }

  private loadVoices() {
    if (!this.synthesis) return;

    const voices = this.synthesis.getVoices();
    if (voices.length > 0) {
      // 尝试找到匹配配置语言的声音
      const lang = this.config.language || 'zh-CN';
      let matchedVoice = null;
      
      // 如果指定了特定声音，优先使用
      if (this.config.voice) {
        matchedVoice = voices.find((v: any) => v.name === this.config.voice);
      }
      
      // 否则找匹配语言的声音
      if (!matchedVoice) {
        matchedVoice = voices.find((v: any) => v.lang.startsWith(lang) && v.localService) ||
                      voices.find((v: any) => v.lang.startsWith(lang));
      }
      
      // 如果没有匹配的，使用默认
      this.voice = matchedVoice || voices[0];
    }
  }

  async speak(text: string): Promise<void> {
    if (!this.synthesis) {
      throw new Error('语音合成未初始化');
    }

    // 先取消当前正在播放的
    this.synthesis.cancel();
    
    // 创建新的发声请求
    if (window.SpeechSynthesisUtterance) {
      this.utterance = new window.SpeechSynthesisUtterance(text);
      
      if (this.utterance) {
        this.utterance.lang = this.config.language || 'zh-CN';
        
        if (this.voice) {
          this.utterance.voice = this.voice;
        }
        
        this.utterance.rate = this.config.rate || 1.0;
        this.utterance.pitch = this.config.pitch || 1.0;
        this.utterance.volume = this.config.volume || 1.0;
        
        this.utterance.onstart = () => {
          this.speaking = true;
          if (this.onStartCallback) {
            this.onStartCallback();
          }
        };
        
        this.utterance.onend = () => {
          this.speaking = false;
          if (this.onEndCallback) {
            this.onEndCallback();
          }
        };
        
        this.utterance.onerror = (event: any) => {
          this.speaking = false;
          if (this.onErrorCallback) {
            this.onErrorCallback(new Error(`语音合成错误: ${event.name || '未知错误'}`));
          }
        };
        
        this.synthesis.speak(this.utterance);
      }
    } else {
      throw new Error('浏览器不支持SpeechSynthesisUtterance');
    }
  }

  async cancel(): Promise<void> {
    if (!this.synthesis) return;
    
    this.synthesis.cancel();
    this.speaking = false;
  }

  async pause(): Promise<void> {
    if (!this.synthesis) return;
    
    this.synthesis.pause();
  }

  async resume(): Promise<void> {
    if (!this.synthesis) return;
    
    this.synthesis.resume();
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  async getVoices(): Promise<any[]> {
    if (!this.synthesis) return [];
    
    return this.synthesis.getVoices();
  }

  setVoice(voice: any | string): void {
    if (typeof voice === 'string') {
      // 按名称查找声音
      this.getVoices().then(voices => {
        const matchedVoice = voices.find((v: any) => v.name === voice);
        if (matchedVoice) {
          this.voice = matchedVoice;
        }
      });
    } else {
      this.voice = voice;
    }
  }

  setLanguage(language: string): void {
    this.config.language = language;
    
    // 尝试重新加载匹配该语言的声音
    this.getVoices().then(voices => {
      const matchedVoice = voices.find((v: any) => v.lang.startsWith(language) && v.localService) ||
                          voices.find((v: any) => v.lang.startsWith(language));
      if (matchedVoice) {
        this.voice = matchedVoice;
      }
    });
  }

  setRate(rate: number): void {
    this.config.rate = rate;
  }

  setPitch(pitch: number): void {
    this.config.pitch = pitch;
  }

  setVolume(volume: number): void {
    this.config.volume = volume;
  }

  onStart(callback: () => void): void {
    this.onStartCallback = callback;
  }

  onEnd(callback: () => void): void {
    this.onEndCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }
}

// OpenAI TTS API 实现
export class OpenAITTS implements SpeechSynthesizer {
  private apiKey: string;
  private language: string;
  private voice: string;
  private rate: number;
  private pitch: number;
  private volume: number;
  private audio: HTMLAudioElement | null = null;
  private speaking = false;
  private onStartCallback: (() => void) | null = null;
  private onEndCallback: (() => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;

  constructor(apiKey: string, config: SpeechSynthesizerConfig = {}) {
    this.apiKey = apiKey;
    this.language = config.language || 'zh';
    this.voice = config.voice || 'alloy'; // OpenAI声音: alloy, echo, fable, onyx, nova, shimmer
    this.rate = config.rate || 1.0;
    this.pitch = config.pitch || 1.0;
    this.volume = config.volume || 1.0;
  }

  async speak(text: string): Promise<void> {
    try {
      // 取消当前语音
      if (this.audio) {
        this.audio.pause();
        this.audio = null;
      }

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice: this.voice,
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI TTS API error: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      this.audio = new Audio(url);
      this.audio.volume = this.volume;
      
      // 设置播放速率 (部分浏览器支持)
      if ('playbackRate' in this.audio) {
        this.audio.playbackRate = this.rate;
      }
      
      this.audio.onplay = () => {
        this.speaking = true;
        if (this.onStartCallback) {
          this.onStartCallback();
        }
      };
      
      this.audio.onended = () => {
        this.speaking = false;
        URL.revokeObjectURL(url);
        if (this.onEndCallback) {
          this.onEndCallback();
        }
      };
      
      this.audio.onerror = (e) => {
        this.speaking = false;
        URL.revokeObjectURL(url);
        if (this.onErrorCallback) {
          this.onErrorCallback(new Error('语音播放错误'));
        }
      };
      
      this.audio.play();
    } catch (error) {
      console.error('OpenAI TTS错误:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  async cancel(): Promise<void> {
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
      this.speaking = false;
    }
  }

  async pause(): Promise<void> {
    if (this.audio) {
      this.audio.pause();
    }
  }

  async resume(): Promise<void> {
    if (this.audio) {
      this.audio.play();
    }
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  async getVoices(): Promise<SpeechSynthesisVoice[]> {
    // OpenAI有固定的声音选项
    return [
      { default: this.voice === 'alloy', lang: this.language, localService: false, name: 'alloy', voiceURI: 'alloy' },
      { default: this.voice === 'echo', lang: this.language, localService: false, name: 'echo', voiceURI: 'echo' },
      { default: this.voice === 'fable', lang: this.language, localService: false, name: 'fable', voiceURI: 'fable' },
      { default: this.voice === 'onyx', lang: this.language, localService: false, name: 'onyx', voiceURI: 'onyx' },
      { default: this.voice === 'nova', lang: this.language, localService: false, name: 'nova', voiceURI: 'nova' },
      { default: this.voice === 'shimmer', lang: this.language, localService: false, name: 'shimmer', voiceURI: 'shimmer' },
    ];
  }

  setVoice(voice: SpeechSynthesisVoice | string): void {
    if (typeof voice === 'string') {
      this.voice = voice;
    } else {
      this.voice = voice.name;
    }
  }

  setLanguage(language: string): void {
    this.language = language;
  }

  setRate(rate: number): void {
    this.rate = rate;
  }

  setPitch(pitch: number): void {
    this.pitch = pitch;
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.audio) {
      this.audio.volume = volume;
    }
  }

  onStart(callback: () => void): void {
    this.onStartCallback = callback;
  }

  onEnd(callback: () => void): void {
    this.onEndCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }
}

// 语音合成工厂函数
export function createSpeechSynthesizer(
  type: 'web' | 'openai' = 'web',
  config: SpeechSynthesizerConfig = {}
): SpeechSynthesizer {
  switch (type) {
    case 'openai':
      if (!config.apiKey) {
        throw new Error('OpenAI TTS需要提供API Key');
      }
      return new OpenAITTS(config.apiKey, config);
    case 'web':
    default:
      return new WebSpeechSynthesizer(config);
  }
} 