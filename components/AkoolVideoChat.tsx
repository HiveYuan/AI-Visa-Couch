'use client';

import React, { useEffect, useRef, useState } from 'react';
// 将Agora SDK的导入移到组件内部以解决SSR问题
import { AkoolService, AkoolSessionCreateResponse } from '@/services/akool';
import { OpenAIRecognizer, createSpeechRecognizer } from '@/aisdk/speech';
import { InterviewMessage, InterviewOptions } from '@/aisdk/interview';
import { getInterviewSystemPrompt, getCoachSystemPrompt } from '@/aisdk/interview/prompts';

// 定义消息类型（从InterviewChat组件复用）
type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  analysis?: {
    badSignals: string[];
    goodSignals: string[];
    unclear: string[];
    nextSteps: string;
  };
};

interface AkoolVideoChatProps {
  apiToken: string;
  openaiApiKey: string;
  avatarId?: string;
}

export default function AkoolVideoChat({ 
  apiToken, 
  openaiApiKey,
  avatarId = 'dvp_Tristan_cloth2_1080P' 
}: AkoolVideoChatProps) {
  // 面试配置
  const interviewOptions: InterviewOptions = {
    visaType: "B1/B2 (Business/Tourism Visa)",
    interviewType: "Standard Interview",
    travelPurpose: "Tourism",
    language: "English",
    difficulty: "Medium"
  };
  
  // 基础状态
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<AkoolSessionCreateResponse | null>(null);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  
  // 面试工作流状态
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStarted, setIsStarted] = useState(false);
  const [isGeneratingReasoning, setIsGeneratingReasoning] = useState(false);
  
  const agoraClient = useRef<any>(null);
  const localAudioTrack = useRef<any>(null);
  const remoteUserRef = useRef<any>(null);
  const videoRef = useRef<HTMLDivElement>(null);
  const akoolServiceRef = useRef<AkoolService | null>(null);
  const messageIdCounterRef = useRef(0);
  const AgoraRTCRef = useRef<any>(null);
  const speechRecognizerRef = useRef<OpenAIRecognizer | null>(null);

  // 在组件内部添加这些新状态
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [showReasoningPanel, setShowReasoningPanel] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [promptType, setPromptType] = useState<'standard' | 'coach'>('coach');

  // 初始化Akool和语音识别
  useEffect(() => {
    akoolServiceRef.current = new AkoolService(apiToken);
    
    // 初始化语音识别
    if (typeof window !== 'undefined') {
      speechRecognizerRef.current = createSpeechRecognizer('openai', {
        apiKey: openaiApiKey,
        language: 'en'
      }) as OpenAIRecognizer;
      
      speechRecognizerRef.current.onResult((text, isFinal) => {
        if (isFinal) {
          setMessage(text);
        }
      });
      
      speechRecognizerRef.current.onError((error) => {
        console.error('语音识别错误:', error);
        setError('语音识别失败: ' + error.message);
      });
      
      speechRecognizerRef.current.onStopped(() => {
        setIsRecording(false);
        // 如果有识别到的文本，自动发送
        if (message.trim()) {
          handleSpeechToAI(message);
        }
      });
    }
    
    // 动态导入AgoraRTC
    let AgoraRTC: any = null;
    const loadAgoraRTC = async () => {
      try {
        if (typeof window !== 'undefined') {
          const agoraModule = await import('agora-rtc-sdk-ng');
          AgoraRTC = agoraModule.default;
          AgoraRTCRef.current = AgoraRTC;
          
          if (akoolServiceRef.current) {
            initSession(AgoraRTC);
          }
        }
      } catch (err) {
        console.error('Failed to load Agora SDK:', err);
        setError('加载SDK失败');
      }
    };
    
    loadAgoraRTC();
    
    // 清理函数
    return () => {
      if (session) {
        akoolServiceRef.current?.closeSession(session._id).catch(console.error);
      }
      leaveCall();
      
      if (speechRecognizerRef.current?.isListening()) {
        speechRecognizerRef.current.stop().catch(console.error);
      }
    };
  }, [apiToken, openaiApiKey]);

  // 创建会话并加入通话
  const initSession = async (AgoraRTC: any) => {
    if (!akoolServiceRef.current || !AgoraRTC) return;
    
    try {
      setLoading(true);
      
      // 创建Akool会话
      const sessionData = await akoolServiceRef.current.createSession(avatarId);
      setSession(sessionData);
      
      // 初始化Agora客户端
      await initAgoraClient(sessionData, AgoraRTC);
      
      // 设置默认为复述模式
      setAvatarParams({ mode: 1 });
      
      // 初始化对话
      initConversation();
      
      setLoading(false);
    } catch (err) {
      console.error('Failed to initialize session:', err);
      setError('初始化会话失败，请刷新页面重试');
      setLoading(false);
    }
  };

  // 初始化对话
  const initConversation = async () => {
    try {
      // 根据选择的 promptType 获取适当的系统提示
      const systemPrompt = promptType === 'coach' 
        ? getCoachSystemPrompt(interviewOptions) 
        : getInterviewSystemPrompt(interviewOptions);
      
      // 系统提示消息
      const systemMessage: Message = {
        role: "system",
        content: systemPrompt,
      };
      
      setMessages([systemMessage]);
      setIsStarted(true);
      
      // 生成第一个问题（欢迎语）
      const initialReasoning = promptType === 'coach'
        ? "我应该先以教练和签证官的身份介绍自己，然后问一个开放性的问题，了解用户的需求"
        : "我应该先问一个开放性的问题，了解用户的需求";
      
      // 通过API获取第一个问题
      const questionResponse = await fetch("/api/interview/next-question", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reasoning: initialReasoning,
          messages: [systemMessage],
          options: interviewOptions,
        }),
      });
      
      if (!questionResponse.ok) {
        const errorText = await questionResponse.text();
        throw new Error(`Failed to generate initial question: ${questionResponse.status} ${errorText}`);
      }
      
      const questionData = await questionResponse.json();
      const firstQuestion = questionData.data?.question;
      
      if (!firstQuestion) {
        throw new Error("Failed to generate initial question");
      }
      
      // 分析思考过程
      const analysis = analyzeReasoning(initialReasoning);
      
      // 添加初始问题消息
      const assistantMessage: Message = { 
        role: "assistant", 
        content: firstQuestion,
        reasoning: initialReasoning,
        analysis: analysis
      };
      
      setMessages([systemMessage, assistantMessage]);
      
      // 让Akool说出第一个问题
      sendMessage(firstQuestion);
      
    } catch (error) {
      console.error("初始化对话失败:", error);
      setError(`初始化对话失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // 思考过程分析函数（从InterviewChat组件复用）
  const analyzeReasoning = (reasoning: string) => {
    const badSignals: string[] = [];
    const goodSignals: string[] = [];
    const unclear: string[] = [];
    let nextSteps = "";
    
    // 拆分段落
    const paragraphs = reasoning.split(/\n+/).filter(p => p.trim());
    
    // 分析每个段落，提取关键信息
    paragraphs.forEach(paragraph => {
      const p = paragraph.toLowerCase();
      
      // 识别负面信号
      if (
        p.includes("suspicious") || 
        p.includes("concern") || 
        p.includes("inconsistent") || 
        p.includes("questionable") || 
        p.includes("doesn't make sense") || 
        p.includes("doesn't add up") || 
        p.includes("red flag") || 
        p.includes("问题") || 
        p.includes("可疑") || 
        p.includes("不一致")
      ) {
        badSignals.push(paragraph);
      }
      
      // 识别正面信号
      else if (
        p.includes("credible") || 
        p.includes("consistent") || 
        p.includes("strong ties") || 
        p.includes("good understanding") || 
        p.includes("convincing") || 
        p.includes("positive") || 
        p.includes("clear") || 
        p.includes("可信") || 
        p.includes("一致") || 
        p.includes("明确")
      ) {
        goodSignals.push(paragraph);
      }
      
      // 识别不明确信息
      else if (
        p.includes("unclear") || 
        p.includes("vague") || 
        p.includes("ambiguous") || 
        p.includes("need more information") || 
        p.includes("need to clarify") || 
        p.includes("不明确") || 
        p.includes("模糊") ||
        p.includes("需要更多信息")
      ) {
        unclear.push(paragraph);
      }
      
      // 识别下一步
      if (
        p.includes("next") || 
        p.includes("follow up") || 
        p.includes("ask about") || 
        p.includes("need to inquire") || 
        p.includes("will ask") ||
        p.includes("下一个问题") ||
        p.includes("接下来") ||
        p.includes("我要问")
      ) {
        nextSteps = paragraph;
      }
    });
    
    // 如果没有找到明确的下一步，尝试使用最后一个段落
    if (!nextSteps && paragraphs.length > 0) {
      nextSteps = paragraphs[paragraphs.length - 1];
    }
    
    return {
      badSignals,
      goodSignals,
      unclear,
      nextSteps
    };
  };

  // 初始化Agora客户端
  const initAgoraClient = async (sessionData: AkoolSessionCreateResponse, AgoraRTC: any) => {
    try {
      // 创建Agora客户端
      agoraClient.current = AgoraRTC.createClient({
        mode: 'rtc',
        codec: 'vp8'
      });
      
      // 注册用户加入和离开的回调
      agoraClient.current.on('user-published', handleUserPublished);
      agoraClient.current.on('user-unpublished', handleUserUnpublished);
      
      // 注册消息接收回调
      agoraClient.current.on('stream-message', handleStreamMessage);
      
      // 加入频道
      const { agora_app_id, agora_channel, agora_token, agora_uid } = sessionData.credentials;
      
      await agoraClient.current.join(
        agora_app_id,
        agora_channel,
        agora_token,
        agora_uid
      );
      
      // 不发布本地音频轨道，因为我们只需要接收虚拟人音频和视频
      
      console.log('Joined Agora channel successfully');
    } catch (err) {
      console.error('Error joining Agora channel:', err);
      throw err;
    }
  };

  // 处理远程用户发布流
  const handleUserPublished = async (user: any, mediaType: 'audio' | 'video') => {
    try {
      // 订阅远程用户
      await agoraClient.current?.subscribe(user, mediaType);
      console.log('Subscribed to remote user:', user.uid);
      
      remoteUserRef.current = user;
      
      // 如果是视频流，将视频添加到DOM
      if (mediaType === 'video') {
        setHasRemoteVideo(true);
        if (videoRef.current && !showReasoningPanel) {
          videoRef.current.innerHTML = '';
          user.videoTrack?.play(videoRef.current);
        }
      }
      
      // 如果是音频流，播放音频
      if (mediaType === 'audio') {
        user.audioTrack?.play();
      }
    } catch (err) {
      console.error('Error subscribing to remote user:', err);
    }
  };

  // 处理远程用户取消发布流
  const handleUserUnpublished = (user: any) => {
    if (remoteUserRef.current?.uid === user.uid) {
      remoteUserRef.current = null;
    }
  };

  // 处理接收到的流消息
  const handleStreamMessage = (uid: number, data: Uint8Array) => {
    try {
      const decoder = new TextDecoder();
      const message = JSON.parse(decoder.decode(data));
      
      if (message.type === 'chat' && message.pld.from === 'bot') {
        setResponseText(message.pld.text);
      }
      
      console.log('Received message:', message);
    } catch (err) {
      console.error('Error parsing stream message:', err);
    }
  };

  // 语音转文字后处理
  const handleSpeechToAI = async (text: string) => {
    if (!text.trim() || isSending || !isStarted) return;
    
    setIsSending(true);
    try {
      // 添加用户消息到历史
      const userMessage: Message = { role: "user", content: text };
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setMessage('');
      
      // 步骤1：生成思考过程
      setIsGeneratingReasoning(true);
      const reasoningResponse = await fetch("/api/interview/reasoning", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: updatedMessages,
          options: interviewOptions,
        }),
      });
      
      if (!reasoningResponse.ok) {
        const errorText = await reasoningResponse.text();
        throw new Error(`思考生成失败: ${reasoningResponse.status} ${errorText}`);
      }
      
      const reasoningData = await reasoningResponse.json();
      const reasoning = reasoningData.data?.reasoning;
      
      if (!reasoning) {
        throw new Error("思考生成失败");
      }
      
      // 分析思考过程
      const analysis = analyzeReasoning(reasoning);
      
      // 步骤2：生成下一个问题
      setIsGeneratingReasoning(false);
      const questionResponse = await fetch("/api/interview/next-question", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reasoning,
          messages: updatedMessages,
          options: interviewOptions,
        }),
      });
      
      if (!questionResponse.ok) {
        const errorText = await questionResponse.text();
        throw new Error(`问题生成失败: ${questionResponse.status} ${errorText}`);
      }
      
      const questionData = await questionResponse.json();
      const question = questionData.data?.question;
      
      if (!question) {
        throw new Error("问题生成失败");
      }
      
      // 添加包含思考过程的AI回复消息
      const assistantMessage: Message = { 
        role: "assistant", 
        content: question,
        reasoning: reasoning,
        analysis: analysis
      };
      
      setMessages([...updatedMessages, assistantMessage]);
      
      // 让Akool虚拟人复述AI回复
      await sendMessage(question);
      
    } catch (error) {
      console.error('处理语音到AI失败:', error);
      setError('AI处理失败，请重试');
    } finally {
      setIsSending(false);
      setIsGeneratingReasoning(false);
    }
  };

  // 发送消息给虚拟人
  const sendMessage = async (textToSend: string) => {
    if (!agoraClient.current || !textToSend.trim()) return;
    
    try {
      const messageId = `msg-${Date.now()}`;
      messageIdCounterRef.current += 1;
      
      const chatMessage = {
        v: 2,
        type: 'chat',
        mid: messageId,
        idx: 0,
        fin: true,
        pld: {
          text: textToSend
        }
      };
      
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(chatMessage));
      
      await agoraClient.current.sendStreamMessage(data, false);
      console.log('Message sent to avatar successfully');
      
    } catch (err) {
      console.error('Failed to send message to avatar:', err);
      setError('发送消息失败，请重试');
    }
  };

  // 开始语音识别
  const startSpeechRecognition = async () => {
    if (!speechRecognizerRef.current || !isStarted) return;
    
    try {
      setIsRecording(true);
      await speechRecognizerRef.current.start();
    } catch (error) {
      console.error('启动语音识别失败:', error);
      setError('启动语音识别失败: ' + (error as Error).message);
      setIsRecording(false);
    }
  };
  
  // 停止语音识别
  const stopSpeechRecognition = async () => {
    if (!speechRecognizerRef.current || !speechRecognizerRef.current.isListening()) return;
    
    try {
      await speechRecognizerRef.current.stop();
    } catch (error) {
      console.error('停止语音识别失败:', error);
      setIsRecording(false);
    }
  };

  // 离开通话
  const leaveCall = async () => {
    try {
      // 离开频道
      if (agoraClient.current) {
        await agoraClient.current.leave();
      }
      
      console.log('Left call successfully');
    } catch (err) {
      console.error('Error leaving call:', err);
    }
  };

  // 设置虚拟人参数
  const setAvatarParams = async (params: { 
    vid?: string;
    vurl?: string; 
    lang?: string;
    mode?: number;
    bgurl?: string;
  }) => {
    if (!agoraClient.current) return;
    
    try {
      const commandMessage = {
        v: 2,
        type: 'command',
        mid: `cmd-${Date.now()}`,
        pld: {
          cmd: 'set-params',
          data: params
        }
      };
      
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(commandMessage));
      
      await agoraClient.current.sendStreamMessage(data, false);
      console.log('Set avatar params successfully');
    } catch (err) {
      console.error('Failed to set avatar params:', err);
    }
  };

  // 中断虚拟人回复
  const interruptResponse = async () => {
    if (!agoraClient.current) return;
    
    try {
      const interruptMessage = {
        v: 2,
        type: 'command',
        mid: `cmd-${Date.now()}`,
        pld: {
          cmd: 'interrupt'
        }
      };
      
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(interruptMessage));
      
      await agoraClient.current.sendStreamMessage(data, false);
      console.log('Interrupt command sent successfully');
    } catch (err) {
      console.error('Failed to send interrupt command:', err);
    }
  };

  // 清除对话历史
  const clearConversation = () => {
    // 保持系统消息
    const systemMessage = messages.find(m => m.role === "system");
    
    if (systemMessage) {
      setMessages([systemMessage]);
      initConversation();
    } else {
      // 如果没有系统消息，重新创建一个
      const newSystemMessage: Message = {
        role: "system",
        content: getInterviewSystemPrompt(interviewOptions),
      };
      setMessages([newSystemMessage]);
      initConversation();
    }
    
    setResponseText('');
    setError(null);
  };

  // 添加获取反馈的函数
  const getFeedback = async () => {
    if (messages.length < 3) return; // 需要有足够的对话内容才能生成反馈
    
    setIsFeedbackLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/interview/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages,
          options: interviewOptions,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`反馈请求失败: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      if (data.code === 0 && data.data?.feedback) {
        setFeedback(data.data.feedback);
        setShowFeedback(true);
      } else {
        throw new Error("无效的反馈数据");
      }
    } catch (error) {
      console.error("获取面试反馈时出错:", error);
      setError(`获取反馈失败: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsFeedbackLoading(false);
    }
  };

  // 添加一个 useEffect 来监听 showReasoningPanel 状态变化，在切回视频时重新播放视频
  useEffect(() => {
    if (!showReasoningPanel && remoteUserRef.current && hasRemoteVideo && videoRef.current) {
      // 延迟一点时间确保DOM已更新
      setTimeout(() => {
        try {
          videoRef.current!.innerHTML = '';
          remoteUserRef.current?.videoTrack?.play(videoRef.current!);
        } catch (err) {
          console.error('Error replaying video track:', err);
        }
      }, 100);
    }
  }, [showReasoningPanel, hasRemoteVideo]);

  // 这里应该返回简化的UI，但由于你要求只写功能部分，我省略完整UI
  return (
    <div className="flex flex-col h-screen w-screen max-w-full px-4 py-4">
      <div className="flex flex-1 h-[70vh] overflow-hidden">
        {/* 左侧：聊天记录 - 设置固定高度并添加overflow-auto */}
        <div className="w-1/2 flex flex-col pr-2 overflow-hidden">
          <div className="flex-1 overflow-y-auto bg-gray-50 rounded-lg p-4 space-y-4">
            {messages.filter(m => m.role !== "system").map((msg, index) => (
              <div 
                key={index} 
                className={`p-3 rounded-lg ${
                  msg.role === "user" ? "bg-blue-100 ml-4" : "bg-white mr-4 border"
                }`}
              >
                <div className="font-bold mb-1">{msg.role === "user" ? "用户:" : "AI:"}</div>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            ))}
          </div>
          
          <div className="mt-4 p-2 flex space-x-2">
            <button
              onClick={() => setShowReasoningPanel(!showReasoningPanel)}
              className="px-3 py-1 bg-gray-200 rounded"
            >
              {showReasoningPanel ? "显示视频" : "查看思考过程"}
            </button>
            
            <button
              onClick={getFeedback}
              disabled={messages.length < 3 || isFeedbackLoading}
              className="px-3 py-1 bg-blue-200 rounded disabled:opacity-50"
            >
              {isFeedbackLoading ? "获取反馈中..." : "获取对话反馈"}
            </button>
          </div>
        </div>
        
        {/* 右侧：视频/思考过程 - 也设置固定高度和滚动 */}
        <div className="w-1/2 flex flex-col pl-2 overflow-hidden">
          {showReasoningPanel ? (
            <div className="flex-1 overflow-y-auto bg-white rounded-lg p-4 border">
              <h3 className="text-lg font-medium mb-4">AI 思考过程</h3>
              {messages.filter(m => m.reasoning && m.role === "assistant").map((msg, index) => (
                <div key={index} className="mb-4 p-3 bg-gray-50 rounded border">
                  <h4 className="font-medium">回复 #{index + 1} 的思考</h4>
                  
                  {msg.analysis && (
                    <div className="mt-2 space-y-2">
                      {msg.analysis.goodSignals.length > 0 && (
                        <div className="space-y-1">
                          <h5 className="text-sm font-medium text-green-600">积极信号:</h5>
                          <ul className="list-disc pl-5">
                            {msg.analysis.goodSignals.map((signal, i) => (
                              <li key={i} className="text-sm text-green-700">{signal}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {msg.analysis.badSignals.length > 0 && (
                        <div className="space-y-1">
                          <h5 className="text-sm font-medium text-red-600">问题关注点:</h5>
                          <ul className="list-disc pl-5">
                            {msg.analysis.badSignals.map((signal, i) => (
                              <li key={i} className="text-sm text-red-700">{signal}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {msg.analysis.unclear.length > 0 && (
                        <div className="space-y-1">
                          <h5 className="text-sm font-medium text-amber-600">需要澄清:</h5>
                          <ul className="list-disc pl-5">
                            {msg.analysis.unclear.map((item, i) => (
                              <li key={i} className="text-sm text-amber-700">{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {msg.analysis.nextSteps && (
                        <div className="mt-2">
                          <h5 className="text-sm font-medium text-blue-600">下一步:</h5>
                          <p className="text-sm text-blue-700">{msg.analysis.nextSteps}</p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-gray-500">查看完整思考</summary>
                    <div className="mt-2 text-sm whitespace-pre-wrap text-gray-600">
                      {msg.reasoning}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 bg-black rounded-lg overflow-hidden relative flex items-center justify-center">
              {loading ? (
                <div className="flex items-center justify-center h-full w-full">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center h-full w-full text-red-500 p-4">
                  <p>{error}</p>
                </div>
              ) : (
                <div ref={videoRef} className="h-full w-full"></div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* 底部区域 */}
      <div className="mt-4 p-4 bg-gray-100 rounded-lg">
        <div className="mb-4 min-h-20 p-3 bg-white rounded border">
          <p>{responseText || '虚拟人将在这里复述AI的回答...'}</p>
        </div>
        
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="输入消息或点击录音按钮..."
            className="flex-1 p-2 border rounded"
            disabled={loading || !!error || isSending || isRecording}
          />
          <button
            onClick={isRecording ? stopSpeechRecognition : startSpeechRecognition}
            disabled={loading || !!error || !isStarted}
            className={`px-4 py-2 rounded ${isRecording ? 'bg-red-500' : 'bg-green-500'} text-white disabled:opacity-50`}
          >
            {isRecording ? '停止录音' : '开始录音'}
          </button>
          <button
            onClick={() => handleSpeechToAI(message)}
            disabled={loading || !!error || !message.trim() || isSending || !isStarted}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
          >
            {isSending ? '处理中...' : '发送'}
          </button>
          <button
            onClick={interruptResponse}
            disabled={loading || !!error}
            className="px-4 py-2 bg-red-500 text-white rounded disabled:opacity-50"
          >
            中断
          </button>
        </div>
        
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setAvatarParams({ lang: 'zh' })}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            中文
          </button>
          <button
            onClick={() => setAvatarParams({ lang: 'en' })}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            英文
          </button>
          <button
            onClick={clearConversation}
            className="px-3 py-1 bg-yellow-200 rounded ml-auto"
          >
            重置对话
          </button>
        </div>
      </div>
      
      {/* 反馈对话框 */}
      {showFeedback && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="p-4 border-b">
              <h2 className="text-xl font-bold">对话反馈</h2>
              <p className="text-sm text-gray-500">AI 对本次对话的分析和评估</p>
            </div>
            
            <div className="p-4 whitespace-pre-wrap">
              {feedback}
            </div>
            
            <div className="p-4 border-t flex justify-end">
              <button
                onClick={() => setShowFeedback(false)}
                className="px-4 py-2 bg-blue-500 text-white rounded"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 