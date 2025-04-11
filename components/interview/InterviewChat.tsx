"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  setErrorFn: (error: string) => void
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
        (errorMsg) => setError(errorMsg)
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
        (errorMsg) => setError(errorMsg)
      );
    } catch (error) {
      console.error("发送消息时出错:", error);
      setError(`发送消息时出错: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
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
  };
  
  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  
  // 关闭反馈对话框
  const closeFeedbackDialog = () => {
    setShowFeedback(false);
  };
  
  return (
    <div className="flex flex-col h-[600px]">
      {!isStarted ? (
        <div className="flex-1 flex flex-col justify-center items-center p-6 space-y-6">
          <h2 className="text-2xl font-bold">美国签证面试模拟训练</h2>
          <p className="text-center text-muted-foreground">
            与AI签证官进行真实的面试对话，获取即时反馈和改进建议
          </p>
          <div className="w-full max-w-md space-y-4">
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
            
            <Button 
              className="w-full" 
              onClick={startInterview} 
              disabled={isLoading}
            >
              {isLoading ? "准备中..." : "开始面试模拟"}
            </Button>
            
            {error && (
              <div className="p-3 text-sm text-white bg-red-500 rounded-md">
                {error}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="bg-muted p-3 flex justify-between items-center border-b">
            <div>
              <span className="font-medium">{visaType}</span>
              <span className="text-xs ml-2 text-muted-foreground">目的: {travelPurpose} | 难度: {difficulty}</span>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={getFeedback}
                disabled={isFeedbackLoading || messages.length < 3}
              >
                {isFeedbackLoading ? "分析中..." : "获取反馈"}
              </Button>
              <Button variant="outline" size="sm" onClick={resetInterview}>
                重新开始
              </Button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.filter(m => m.role !== "system").map((message, index) => (
              <div
                key={index}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg p-3",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {message.role === "assistant" && (
                      <Avatar className="h-8 w-8">
                        <div className="h-full w-full flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold">
                          VO
                        </div>
                      </Avatar>
                    )}
                    <div className="flex-1 whitespace-pre-wrap">{message.content}</div>
                  </div>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg p-3 bg-muted">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <div className="h-full w-full flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold">
                        VO
                      </div>
                    </Avatar>
                    <div>思考中...</div>
                  </div>
                </div>
              </div>
            )}
            
            {error && (
              <div className="p-3 my-2 text-sm text-white bg-red-500 rounded-md">
                {error}
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
          
          <form onSubmit={handleSubmit} className="border-t p-4">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入你的回答..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button type="submit" disabled={isLoading || !input.trim()}>
                发送
              </Button>
            </div>
          </form>
        </>
      )}
      
      {/* 反馈对话框 */}
      <Dialog open={showFeedback} onOpenChange={closeFeedbackDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>签证面试分析与反馈</DialogTitle>
            <DialogDescription>
              基于本次模拟面试对话的AI评估结果和改进建议
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 p-4 bg-muted rounded-lg whitespace-pre-wrap">
            {feedback}
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="secondary" onClick={closeFeedbackDialog}>关闭</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 