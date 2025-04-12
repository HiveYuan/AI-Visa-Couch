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
  "B1/B2 (Business/Tourism Visa)",
  "F1 (Student Visa)",
  "J1 (Exchange Visitor)",
  "H1B (Work Visa)",
  "L1 (Intracompany Transfer)",
  "O1 (Extraordinary Ability)",
];

const INTERVIEW_TYPES = [
  "Standard Interview",
  "Strict Review",
  "Quick Interview",
  "In-depth Inquiry",
];

const TRAVEL_PURPOSES = [
  "Tourism",
  "Family Visit",
  "Business",
  "Study",
  "Academic Exchange",
  "Short-term Work",
  "Conference",
  "Medical Treatment",
];

const DIFFICULTY_LEVELS = ["Easy", "Medium", "Hard", "Challenging"];

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
    setErrorFn(`Request failed: ${response.status} ${errorText}`);
    return;
  }
  
  const reader = response.body?.getReader();
  if (!reader) {
    setErrorFn("Unable to read response stream");
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
        
        // Parse streaming data (may contain multiple JSON)
        const parts = chunk.split("\n");
        for (const part of parts) {
          if (part.trim()) {
            try {
              const data = JSON.parse(part);
              if (data.type === "text" && data.value) {
                text += data.value;
                // Update reply content
                const assistantMessage: Message = { 
                  role: "assistant", 
                  content: text 
                };
                updateMessagesFn([...initialMessages, assistantMessage]);
              }
            } catch (e) {
              // Ignore non-JSON data or parsing errors
              console.log("Error parsing response data:", part, e);
            }
          }
        }
      }
    }
    
    // Ensure final message is set
    const assistantMessage: Message = { 
      role: "assistant", 
      content: text 
    };
    updateMessagesFn([...initialMessages, assistantMessage]);
    
    // If a function to set the last message is provided, update the latest AI reply
    if (setLastMessageFn && text) {
      setLastMessageFn(text);
      
      // Add delay to ensure DOM is fully updated before triggering auto-play
      setTimeout(() => {
        try {
          // Try to find and play voice
          const speechButton = document.querySelector('[data-auto-play="true"]') as HTMLElement;
          if (speechButton) {
            console.log("Found the speech button for the latest AI reply, preparing to auto-play");
            // Add a bit more delay to ensure component is fully mounted
            setTimeout(() => {
              speechButton.click();
              console.log("Triggered voice auto-play");
            }, 200);
          } else {
            console.log("Auto-play button not found, DOM may not be fully updated");
          }
        } catch (err) {
          console.error("Error triggering voice playback:", err);
        }
      }, 800);
    }
  } catch (error) {
    console.error("Error processing streaming response:", error);
    setErrorFn(`Error processing response: ${error instanceof Error ? error.message : String(error)}`);
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
  
  // 调试日志 - 监控组件渲染
  useEffect(() => {
    console.log("[InterviewChat] 组件渲染，当前状态:");
    console.log("- isStarted:", isStarted);
    console.log("- isLoading:", isLoading);
    console.log("- input内容:", input ? `[${input.length}字符]` : "空");
    console.log("- 消息数量:", messages.length);
  }, [isStarted, isLoading, input, messages.length]);
  
  // 调试日志 - 注意handleSpeechSubmit函数的可用性
  useEffect(() => {
    console.log("[InterviewChat] handleSpeechSubmit 是否可用:", typeof handleSpeechSubmit === "function");
  }, []);
  
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
      content: `You are a visa officer at the U.S. Embassy in China, conducting a ${actualVisaType} visa ${interviewType.toLowerCase()}.
The applicant's purpose of travel is ${travelPurpose.toLowerCase()}.
Please conduct the interview in English with a difficulty level of ${difficulty.toLowerCase()}.
Your goal is to assess the applicant's true intent, the reasonableness of their travel plans, the appropriate length of stay, and their ties to China.
During the interview, ask questions that reflect a real visa interview and follow up based on the applicant's responses.
Maintain a professional, serious but polite attitude.
Limit each response to 1-2 questions to keep the conversation flowing.
Interview characteristics: questions are brief and direct, typically without much explanation, and rapid topic changes are common.
At the end of the interview, you will provide a brief assessment of the applicant's performance and an analysis of whether they are likely to receive a visa.`,
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
    console.log("[InterviewChat] 收到语音识别结果:", text ? `[${text.length}字符]` : "空");
    console.log("[InterviewChat] 识别前input:", input ? `[${input.length}字符]` : "空");
    
    // 直接使用语音识别提供的文本，该文本已经包含了累积结果
    setInput(text);
    
    // 可以添加调试日志
    if (text.length > 100) {
      console.log(`[InterviewChat] 接收到长语音输入: ${text.length}字符, 前50字符: ${text.substring(0, 50)}...`);
    }
  };
  
  // 处理语音输入完成后的自动提交
  const handleSpeechSubmit = (recognizedText?: string) => {
    console.log("[InterviewChat] handleSpeechSubmit被触发, 参数:", recognizedText ? `[${recognizedText.length}字符]` : "无");
    console.log("[InterviewChat] 当前input状态:", input ? `[${input.length}字符]` : "空");
    console.log("[InterviewChat] isLoading:", isLoading, "isStarted:", isStarted);
    
    // 使用静态变量跟踪最后提交的文本，防止重复提交
    if ((handleSpeechSubmit as any).lastSubmittedText === recognizedText) {
      console.log("[InterviewChat] 检测到重复提交，忽略");
      return;
    }
    (handleSpeechSubmit as any).lastSubmittedText = recognizedText;
    
    const textToSubmit = recognizedText || input;
    console.log("[InterviewChat] 将使用文本:", textToSubmit ? `[${textToSubmit.length}字符]` : "空");
    
    if (textToSubmit.trim() && !isLoading && isStarted) {
      console.log("[InterviewChat] 条件满足，准备提交文本:", textToSubmit.substring(0, 50) + (textToSubmit.length > 50 ? "..." : ""));
      // 直接调用发送消息函数，而不是模拟表单提交事件
      const userMessage: Message = { role: "user", content: textToSubmit };
      console.log("[InterviewChat] 创建用户消息:", userMessage);
      const newMessages: Message[] = [...messages, userMessage];
      console.log("[InterviewChat] 更新消息列表，当前消息数:", newMessages.length);
      setMessages(newMessages);
      setInput("");
      setIsLoading(true);
      setError(null);
      
      const actualVisaType = visaType.split(" ")[0];
      console.log("[InterviewChat] 开始发送请求...");
      
      // 发送对话请求
      fetch("/api/interview/chat", {
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
      })
      .then(response => {
        console.log("[InterviewChat] 收到响应，准备处理流式回复");
        handleStreamResponse(
          response,
          newMessages,
          (newMessages) => setMessages(newMessages),
          (errorMsg) => setError(errorMsg),
          (text) => setLastAssistantMessage(text)
        );
      })
      .catch(error => {
        console.error("[InterviewChat] 发送消息时出错:", error);
        setError(`发送消息时出错: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        console.log("[InterviewChat] 请求处理完成，重置加载状态");
        setIsLoading(false);
      });
    } else {
      console.log("[InterviewChat] 条件不满足，不提交文本:");
      console.log("- 文本非空:", !!textToSubmit.trim());
      console.log("- 非加载状态:", !isLoading);
      console.log("- 面试已开始:", isStarted);
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
            language: "en" // 设置语言为英文
          },
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Feedback request failed: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      if (data.code === 0 && data.data?.feedback) {
        setFeedback(data.data.feedback);
        setShowFeedback(true);
      } else {
        throw new Error("Invalid feedback data");
      }
    } catch (error) {
      console.error("Error getting interview feedback:", error);
      setError(`Error getting feedback: ${error instanceof Error ? error.message : String(error)}`);
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
          placeholder="Type your answer..."
          disabled={isLoading || !isStarted}
          className="flex-1"
        />
        <SpeechInput 
          onResult={handleSpeechResult}
          onSubmit={handleSpeechSubmit}
          disabled={isLoading || !isStarted}
          recognizerType="openai"
          language="en"
          autoSubmit={true}
        />
        <Button type="submit" disabled={isLoading || !isStarted || !input.trim()}>
          Send
        </Button>
      </form>
    );
  };
  
  // 渲染消息气泡
  const renderMessage = (message: Message, index: number) => {
    const isAssistant = message.role === "assistant";
    const isLatestAssistantMsg = isAssistant && message.content === lastAssistantMessage;
    
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
                VO
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
              <div className={cn(
                "absolute -right-10 top-1/2 transform -translate-y-1/2 transition-opacity",
                isLatestAssistantMsg ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}>
                <SpeechOutput 
                  text={message.content}
                  autoplay={isLatestAssistantMsg}
                  useOpenAI={true}
                  voice="alloy" 
                  language="en"
                />
              </div>
            )}
          </div>
          {message.role === "user" && (
            <Avatar className="mt-1">
              <div className="w-10 h-10 rounded-full bg-muted text-foreground flex items-center justify-center font-semibold">
                You
              </div>
            </Avatar>
          )}
        </div>
      </div>
    );
  };
  
  // 渲染配置表单
  const renderConfigForm = () => {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Visa Interview Simulator</h2>
        <p className="text-muted-foreground">Configure your interview settings below.</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Visa Type</label>
            <Select value={visaType} onValueChange={setVisaType}>
              <SelectTrigger>
                <SelectValue placeholder="Select visa type" />
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
            <label className="text-sm font-medium">Interview Type</label>
            <Select value={interviewType} onValueChange={setInterviewType}>
              <SelectTrigger>
                <SelectValue placeholder="Select interview type" />
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
            <label className="text-sm font-medium">Travel Purpose</label>
            <Select value={travelPurpose} onValueChange={setTravelPurpose}>
              <SelectTrigger>
                <SelectValue placeholder="Select travel purpose" />
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
            <label className="text-sm font-medium">Difficulty Level</label>
            <Select value={difficulty} onValueChange={setDifficulty}>
              <SelectTrigger>
                <SelectValue placeholder="Select difficulty" />
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
          className="w-full"
        >
          {isLoading ? "Starting Interview..." : "Start Interview"}
        </Button>
      </div>
    );
  };

  // 渲染面试头部
  const renderInterviewHeader = () => {
    return (
      <div className="flex justify-between items-center border-b pb-4 mb-4">
        <div>
          <h2 className="text-xl font-bold">
            {visaType.split(" ")[0]} Visa Interview
          </h2>
          <p className="text-sm text-muted-foreground">
            Purpose: {travelPurpose} | Type: {interviewType} | Difficulty: {difficulty}
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={resetInterview}
            disabled={isLoading}
          >
            Reset
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={getFeedback}
            disabled={isLoading || isFeedbackLoading || messages.length < 3}
          >
            {isFeedbackLoading ? "Getting Feedback..." : "Get Feedback"}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="container max-w-4xl mx-auto py-6 space-y-8">
      {!isStarted ? (
        renderConfigForm()
      ) : (
        <>
          {renderInterviewHeader()}
          
          <div className="space-y-4 mb-4 max-h-[60vh] overflow-y-auto p-4 border rounded-lg">
            {messages.filter(m => m.role !== "system").map((message, index) => 
              renderMessage(message, index)
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-md p-3 mb-4">
              {error}
            </div>
          )}
          
          {renderChatForm()}
        </>
      )}
      
      <Dialog open={showFeedback} onOpenChange={setShowFeedback}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Interview Feedback</DialogTitle>
            <DialogDescription>
              Analysis of your interview performance
            </DialogDescription>
          </DialogHeader>
          <div className="prose prose-sm mt-4 max-w-none">
            {feedback.split('\n').map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
          <Button onClick={closeFeedbackDialog} className="mt-4">Close</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
} 