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
  jobTitle: string;
  jobLevel: string;
  interviewStage: string;
};

// 预设的职位选项
const JOB_TITLES = [
  "前端开发工程师",
  "后端开发工程师",
  "全栈开发工程师",
  "iOS开发工程师",
  "Android开发工程师",
  "数据工程师",
  "算法工程师",
  "产品经理",
  "UI设计师",
  "UX设计师",
  "测试工程师",
  "DevOps工程师",
];

const JOB_LEVELS = ["初级", "中级", "高级", "资深", "专家"];

const INTERVIEW_STAGES = ["技术面试", "HR面试", "行为面试", "系统设计面试"];

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
  const [jobTitle, setJobTitle] = useState(JOB_TITLES[0]);
  const [jobLevel, setJobLevel] = useState(JOB_LEVELS[1]);
  const [interviewStage, setInterviewStage] = useState(INTERVIEW_STAGES[0]);
  
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
    
    const options: InterviewOptions = {
      jobTitle,
      jobLevel,
      interviewStage,
    };
    
    // 系统提示消息（不显示给用户）
    const systemMessage: Message = {
      role: "system",
      content: `你是一位专业的${jobTitle}${jobLevel}岗位${interviewStage}面试官。
请用中文与候选人进行面试对话。
你的目标是评估候选人的技能、经验和文化契合度。
面试过程中，请提出有针对性的问题，根据候选人的回答进行跟进提问。
保持专业、友好的态度，给予真实的反馈。
每次回复控制在2-3句话以内，保持对话的流畅性。
在面试结束时，你将对候选人的表现进行简要评估。`,
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
      // 发送对话请求
      const response = await fetch("/api/interview/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: newMessages,
          options: {
            jobTitle,
            jobLevel,
            interviewStage,
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
      const response = await fetch("/api/interview/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages,
          options: {
            jobTitle,
            jobLevel,
            interviewStage,
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
          <h2 className="text-2xl font-bold">开始一场AI模拟面试</h2>
          <div className="w-full max-w-md space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">选择职位</label>
              <Select value={jobTitle} onValueChange={setJobTitle}>
                <SelectTrigger>
                  <SelectValue placeholder="选择职位" />
                </SelectTrigger>
                <SelectContent>
                  {JOB_TITLES.map((title) => (
                    <SelectItem key={title} value={title}>
                      {title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">职位级别</label>
              <Select value={jobLevel} onValueChange={setJobLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="选择级别" />
                </SelectTrigger>
                <SelectContent>
                  {JOB_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">面试环节</label>
              <Select value={interviewStage} onValueChange={setInterviewStage}>
                <SelectTrigger>
                  <SelectValue placeholder="选择面试环节" />
                </SelectTrigger>
                <SelectContent>
                  {INTERVIEW_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {stage}
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
              {isLoading ? "准备中..." : "开始面试"}
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
              <span className="font-medium">{jobTitle} {jobLevel}</span>
              <span className="text-xs ml-2 text-muted-foreground">{interviewStage}</span>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={getFeedback}
                disabled={isFeedbackLoading || messages.length < 3}
              >
                {isFeedbackLoading ? "生成中..." : "获取反馈"}
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
                          AI
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
                        AI
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
            <DialogTitle>面试反馈</DialogTitle>
            <DialogDescription>
              基于这次面试对话的AI评估结果
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