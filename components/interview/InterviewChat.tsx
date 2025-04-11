"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SpeechInput } from "@/components/interview/SpeechInput";
import { SpeechOutput } from "@/components/SpeechOutputFixed";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

type InterviewOptions = {
  visaType: string;
  interviewType: string;
  travelPurpose: string;
  difficulty: string;
};

// 预设的签证类型选项
const VISA_TYPES = [
  "B1/B2 (商务/旅游签证)",
  "F1 (学生签证)",
  "J1 (交流访问学者)",
  "H1B (工作签证)",
  "L1 (跨国公司内部调动)",
  "O1 (特殊人才签证)",
];

const INTERVIEW_TYPES = [
  "标准面试",
  "严格审查",
  "快速面试",
  "深入询问",
];

const TRAVEL_PURPOSES = [
  "旅游",
  "探亲",
  "商务",
  "学习",
  "学术交流",
  "短期工作",
  "会议",
  "医疗",
];

const DIFFICULTY_LEVELS = ["简单", "中等", "困难", "极具挑战"];

// 处理流式响应的函数
async function handleStreamResponse(
  response: Response,
  initialMessages: Message[],
  updateMessagesFn: (messages: Message[]) => void,
  setErrorFn: (error: string) => void,
  setLastMessageFn?: (text: string) => void
) {
  if (!response.ok) {
    const errorText = await response.text();
    setErrorFn(`请求失败: ${response.status} ${errorText}`);
    return;
  }
  
  const reader = response.body?.getReader();
  if (!reader) {
    setErrorFn("无法读取响应流");
    return;
  }
  
  const decoder = new TextDecoder();
  let done = false;
  let text = "";
  
  try {
    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        
        // 解析流式数据（可能包含多个JSON）
        const parts = chunk.split("\n");
        for (const part of parts) {
          if (part.trim()) {
            try {
              const data = JSON.parse(part);
              if (data.type === "text" && data.value) {
                text += data.value;
                // 更新回复内容
                const assistantMessage: Message = { 
                  role: "assistant", 
                  content: text 
                };
                updateMessagesFn([...initialMessages, assistantMessage]);
              }
            } catch (e) {
              // 忽略非JSON数据或解析错误
              console.log("解析响应数据错误:", part, e);
            }
          }
        }
      }
    }
    
    // 确保最终消息被设置
    const assistantMessage: Message = { 
      role: "assistant", 
      content: text 
    };
    updateMessagesFn([...initialMessages, assistantMessage]);
    
    // 如果提供了设置最后消息的函数，更新最后的AI回复
    if (setLastMessageFn && text) {
      setLastMessageFn(text);
    }
  } catch (error) {
    console.error("处理流式响应时出错:", error);
    setErrorFn(`处理响应时出错: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export default function InterviewChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 面试配置
  const [visaType, setVisaType] = useState(VISA_TYPES[0]);
  const [interviewType, setInterviewType] = useState(INTERVIEW_TYPES[0]);
  const [travelPurpose, setTravelPurpose] = useState(TRAVEL_PURPOSES[0]);
  const [difficulty, setDifficulty] = useState(DIFFICULTY_LEVELS[1]);
  
  // 是否已开始面试
  const [isStarted, setIsStarted] = useState(false);
  
  // 反馈相关状态
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  
  // 自动滚动
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [lastAssistantMessage, setLastAssistantMessage] = useState<string>("");
  
  // 开始面试
  const startInterview = async () => {
    setIsLoading(true);
    setError(null);
    
    // 提取实际签证类型（去掉描述部分）
    const actualVisaType = visaType.split(" ")[0];
    
    const options: InterviewOptions = {
      visaType: actualVisaType,
      interviewType,
      travelPurpose,
      difficulty,
    };
    
    // 系统提示消息（不显示给用户）
    const systemMessage: Message = {
      role: "system",
      content: `你是一位美国驻华使领馆的签证官，正在进行${actualVisaType}签证的${interviewType}。
申请人的旅行目的是${travelPurpose}。
请用中文与申请人进行面试对话，难度设定为${difficulty}。
你的目标是评估申请人申请签证的真实意图、访美计划的合理性、在美停留时间的合理性，以及申请人与中国的联系纽带等。
面试过程中，请提出符合真实签证面试的问题，根据申请人的回答进行跟进提问。
保持专业、严肃但不失礼貌的态度。
每次回复控制在1-2个问题以内，保持对话的流畅性。
面试特点：问题简短直接，通常不做过多解释，快速切换话题是常见的。
在面试结束时，你将对申请人的表现进行简要评估，并给出是否可能获得签证的分析。`,
    };
    
    // 设置初始消息
    const initialMessages: Message[] = [systemMessage];
    setMessages(initialMessages);
    
    try {
      const response = await fetch("/api/interview/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: initialMessages,
          options,
        }),
      });
      
      await handleStreamResponse(
        response,
        initialMessages,
        (newMessages) => setMessages(newMessages),
        (errorMsg) => setError(errorMsg),
        (text) => setLastAssistantMessage(text)
      );
      
      setIsStarted(true);
    } catch (error) {
      console.error("开始面试时出错:", error);
      setError(`开始面试时出错: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // 发送消息
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    // 添加用户消息
    const userMessage: Message = { role: "user", content: input };
    const newMessages: Message[] = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setError(null);
    
    try {
      const actualVisaType = visaType.split(" ")[0];
      
      // 发送对话请求
      const response = await fetch("/api/interview/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: newMessages,
          options: {
            visaType: actualVisaType,
            interviewType,
            travelPurpose,
            difficulty,
          },
        }),
      });
      
      await handleStreamResponse(
        response,
        newMessages,
        (newMessages) => setMessages(newMessages),
        (errorMsg) => setError(errorMsg),
        (text) => setLastAssistantMessage(text)
      );
    } catch (error) {
      console.error("发送消息时出错:", error);
      setError(`发送消息时出错: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // 处理语音输入结果
  const handleSpeechResult = (text: string) => {
    setInput(text);
  };
  
  // 获取面试反馈
  const getFeedback = async () => {
    if (messages.length < 3) return; // 需要有足够的对话内容才能生成反馈
    
    setIsFeedbackLoading(true);
    setError(null);
    
    try {
      const actualVisaType = visaType.split(" ")[0];
      
      const response = await fetch("/api/interview/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages,
          options: {
            visaType: actualVisaType,
            interviewType,
            travelPurpose,
            difficulty,
          },
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`获取反馈失败: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      if (data.code === 0 && data.data?.feedback) {
        setFeedback(data.data.feedback);
        setShowFeedback(true);
      } else {
        throw new Error("反馈数据无效");
      }
    } catch (error) {
      console.error("获取面试反馈时出错:", error);
      setError(`获取反馈时出错: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsFeedbackLoading(false);
    }
  };
  
  // 重新开始面试
  const resetInterview = () => {
    setMessages([]);
    setIsStarted(false);
    setShowFeedback(false);
    setFeedback("");
    setError(null);
    setLastAssistantMessage("");
  };
  
  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  
  // 关闭反馈对话框
  const closeFeedbackDialog = () => {
    setShowFeedback(false);
  };
  
  // 渲染聊天表单
  const renderChatForm = () => {
    return (
      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t pt-4">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="请输入您的回答..."
          disabled={isLoading || !isStarted}
          className="flex-1"
        />
        <SpeechInput 
          onResult={handleSpeechResult}
          disabled={isLoading || !isStarted}
          recognizerType="openai"
        />
        <Button type="submit" disabled={isLoading || !isStarted || !input.trim()}>
          发送
        </Button>
      </form>
    );
  };
  
  // 渲染消息气泡
  const renderMessage = (message: Message, index: number) => {
    const isAssistant = message.role === "assistant";
    
    return (
      <div
        key={index}
        className={cn(
          "flex",
          isAssistant ? "justify-start" : "justify-end"
        )}
      >
        <div className="flex items-start max-w-[80%] space-x-2">
          {isAssistant && (
            <Avatar className="mt-1">
              <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                签证官
              </div>
            </Avatar>
          )}
          <div
            className={cn(
              "rounded-lg px-4 py-2 text-sm group relative",
              isAssistant
                ? "bg-muted text-foreground"
                : "bg-primary text-primary-foreground"
            )}
          >
            {message.content}
            
            {isAssistant && (
              <div className="opacity-0 group-hover:opacity-100 absolute -right-10 top-1/2 transform -translate-y-1/2 transition-opacity">
                <SpeechOutput 
                  text={message.content}
                  autoplay={message.content === lastAssistantMessage}
                  useOpenAI={true}
                  voice="nova" // 使用nova声音，适合中文发音的女性声音
                  language="zh"
                />
              </div>
            )}
          </div>
          {message.role === "user" && (
            <Avatar className="mt-1">
              <div className="w-10 h-10 rounded-full bg-muted text-foreground flex items-center justify-center font-semibold">
                您
              </div>
            </Avatar>
          )}
        </div>
      </div>
    );
  };
  
  return (
    <div className="flex flex-col h-[calc(100vh-16rem)]">
      {/* 面试配置选择区 */}
      {!isStarted && (
        <div className="mb-4 p-4 bg-muted/50 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">面试设置</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">签证类型</label>
              <Select value={visaType} onValueChange={setVisaType}>
                <SelectTrigger>
                  <SelectValue placeholder="选择签证类型" />
                </SelectTrigger>
                <SelectContent>
                  {VISA_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">面试类型</label>
              <Select value={interviewType} onValueChange={setInterviewType}>
                <SelectTrigger>
                  <SelectValue placeholder="选择面试类型" />
                </SelectTrigger>
                <SelectContent>
                  {INTERVIEW_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">旅行目的</label>
              <Select value={travelPurpose} onValueChange={setTravelPurpose}>
                <SelectTrigger>
                  <SelectValue placeholder="选择旅行目的" />
                </SelectTrigger>
                <SelectContent>
                  {TRAVEL_PURPOSES.map((purpose) => (
                    <SelectItem key={purpose} value={purpose}>
                      {purpose}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">难度级别</label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger>
                  <SelectValue placeholder="选择难度级别" />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTY_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <Button 
            onClick={startInterview} 
            disabled={isLoading} 
            className="w-full mt-4"
          >
            {isLoading ? "初始化中..." : "开始面试"}
          </Button>
          
          {error && (
            <div className="mt-4 p-2 bg-red-50 border border-red-200 text-red-600 rounded">
              {error}
            </div>
          )}
        </div>
      )}
      
      {/* 聊天区 */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {messages.filter(msg => msg.role !== "system").map((message, i) => 
          renderMessage(message, i)
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* 输入区域 */}
      {isStarted && renderChatForm()}
      
      {/* 操作按钮 */}
      {isStarted && (
        <div className="flex justify-center gap-4 mt-4">
          <Button
            variant="outline"
            onClick={() => setShowFeedback(true)}
            disabled={messages.length < 3 || isFeedbackLoading}
          >
            获取面试反馈
          </Button>
          <Button variant="outline" onClick={resetInterview}>
            重新开始
          </Button>
        </div>
      )}
      
      {/* 反馈对话框 */}
      <Dialog open={showFeedback} onOpenChange={setShowFeedback}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>面试表现反馈</DialogTitle>
            <DialogDescription>
              以下是基于您当前面试对话的分析与建议
            </DialogDescription>
          </DialogHeader>
          
          {isFeedbackLoading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-2">分析中...</span>
            </div>
          ) : feedback ? (
            <div className="space-y-4 py-4">
              <div className="prose dark:prose-invert max-w-none">
                {feedback.split("\n").map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
              <Button 
                onClick={closeFeedbackDialog} 
                className="w-full"
              >
                关闭
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Button onClick={getFeedback}>获取详细反馈</Button>
              <p className="text-sm text-muted-foreground">
                点击按钮获取基于当前对话的详细反馈和建议
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
} 