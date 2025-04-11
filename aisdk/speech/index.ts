// 为Web Speech API扩展Window接口
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

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

  constructor(apiKey: string, language: string = 'zh') {
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
      console.error('错误启动OpenAI语音识别:', error);
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
      console.error('错误停止OpenAI语音识别:', error);
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
      const formData = new FormData();
      formData.append('file', audioBlob, 'recording.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', this.language);

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (data.text && this.resultCallback) {
        this.resultCallback(data.text, true);
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