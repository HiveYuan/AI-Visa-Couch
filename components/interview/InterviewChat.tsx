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
import { getInitialInterviewPrompt, getInitialReasoningPrompt } from "@/aisdk/interview/prompts";
import { InterviewOptions } from "@/aisdk/interview/types";

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
  
  // 新增生成思考过程状态
  const [isGeneratingReasoning, setIsGeneratingReasoning] = useState(false);
  
  // 语音合成配置
  const localeLang = "en-US"; // 语音合成使用的语言
  const systemVoice = "alloy"; // 语音合成使用的声音
  
  // 恢复lastAssistantMessage变量
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
      content: getInitialInterviewPrompt(options),
    };
    
    // 设置初始消息
    const initialMessages: Message[] = [systemMessage];
    setMessages(initialMessages);
    
    try {
      // 使用生成思考和问题的方式处理第一个问题，而不是直接使用流式输出
      // 这样可以确保第一个问题不会一次性输出多个问题
      const initialReasoning = getInitialReasoningPrompt();
      
      // 生成第一个问题
      const questionResponse = await fetch("/api/interview/next-question", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reasoning: initialReasoning,
          messages: initialMessages,
          options,
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
      
      // 添加初始问题消息
      const assistantMessage: Message = { 
        role: "assistant", 
        content: firstQuestion,
        reasoning: initialReasoning,
        analysis: {
          badSignals: [],
          goodSignals: [],
          unclear: [],
          nextSteps: "Ask about the applicant's travel purpose"
        }
      };
      
      setMessages([...initialMessages, assistantMessage]);
      setLastAssistantMessage(firstQuestion);
      
      // 添加延迟以确保DOM完全更新后触发自动播放
      setTimeout(() => {
        try {
          // 尝试查找并播放声音
          const speechButton = document.querySelector('[data-auto-play="true"]') as HTMLElement;
          if (speechButton) {
            console.log("Found the speech button for the initial question, preparing to auto-play");
            // 添加更多延迟以确保组件完全装载
            setTimeout(() => {
              speechButton.click();
              console.log("Triggered voice auto-play for initial question");
            }, 200);
          } else {
            console.log("Auto-play button not found, DOM may not be fully updated");
          }
        } catch (err) {
          console.error("Error triggering voice playback:", err);
        }
      }, 800);
      
      setIsStarted(true);
    } catch (error) {
      console.error("开始面试时出错:", error);
      setError(`开始面试时出错: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // 修改handleSubmit函数，使用新的两步API流程
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
      const interviewOptions = {
        visaType: actualVisaType,
        interviewType,
        travelPurpose,
        difficulty,
      };
      
      // 步骤1：生成思考过程
      setIsGeneratingReasoning(true);
      const reasoningResponse = await fetch("/api/interview/reasoning", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: newMessages,
          options: interviewOptions,
        }),
      });
      
      if (!reasoningResponse.ok) {
        const errorText = await reasoningResponse.text();
        throw new Error(`Reasoning request failed: ${reasoningResponse.status} ${errorText}`);
      }
      
      const reasoningData = await reasoningResponse.json();
      const reasoning = reasoningData.data?.reasoning;
      
      if (!reasoning) {
        throw new Error("Failed to generate reasoning");
      }
      
      // 分析思考过程，提取关键信息
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
          messages: newMessages,
          options: interviewOptions,
        }),
      });
      
      if (!questionResponse.ok) {
        const errorText = await questionResponse.text();
        throw new Error(`Question request failed: ${questionResponse.status} ${errorText}`);
      }
      
      const questionData = await questionResponse.json();
      const question = questionData.data?.question;
      
      if (!question) {
        throw new Error("Failed to generate question");
      }
      
      // 添加包含思考过程的消息
      const assistantMessage: Message = { 
        role: "assistant", 
        content: question,
        reasoning: reasoning,
        analysis: analysis
      };
      
      setMessages([...newMessages, assistantMessage]);
      setLastAssistantMessage(question);
      
      // 添加延迟以确保DOM完全更新后触发自动播放
      setTimeout(() => {
        try {
          // 尝试查找并播放声音
          const speechButton = document.querySelector('[data-auto-play="true"]') as HTMLElement;
          if (speechButton) {
            console.log("Found the speech button for the latest AI reply, preparing to auto-play");
            // 添加更多延迟以确保组件完全装载
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
      
    } catch (error) {
      console.error("发送消息时出错:", error);
      setError(`发送消息时出错: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
      setIsGeneratingReasoning(false);
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
  
  // 同样修改handleSpeechSubmit函数，使用新的两步API流程
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
      
      // 步骤1：生成思考过程
      setIsGeneratingReasoning(true);
      fetch("/api/interview/reasoning", {
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
        if (!response.ok) {
          return response.text().then(text => {
            throw new Error(`Reasoning request failed: ${response.status} ${text}`);
          });
        }
        return response.json();
      })
      .then(reasoningData => {
        const reasoning = reasoningData.data?.reasoning;
        if (!reasoning) {
          throw new Error("Failed to generate reasoning");
        }
        
        // 分析思考过程，提取关键信息
        const analysis = analyzeReasoning(reasoning);
        
        // 步骤2：生成下一个问题
        setIsGeneratingReasoning(false);
        return fetch("/api/interview/next-question", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reasoning,
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
          if (!response.ok) {
            return response.text().then(text => {
              throw new Error(`Question request failed: ${response.status} ${text}`);
            });
          }
          return response.json();
        })
        .then(questionData => {
          const question = questionData.data?.question;
          if (!question) {
            throw new Error("Failed to generate question");
          }
          
          // 添加包含思考过程的消息
          const assistantMessage: Message = { 
            role: "assistant", 
            content: question,
            reasoning: reasoning,
            analysis: analysis
          };
          
          setMessages([...newMessages, assistantMessage]);
          setLastAssistantMessage(question);
          
          // 添加延迟以确保DOM完全更新后触发自动播放
          setTimeout(() => {
            try {
              // 尝试查找并播放声音
              const speechButton = document.querySelector('[data-auto-play="true"]') as HTMLElement;
              if (speechButton) {
                console.log("Found the speech button for the latest AI reply, preparing to auto-play");
                // 添加更多延迟以确保组件完全装载
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
        });
      })
      .catch(error => {
        console.error("[InterviewChat] 发送消息时出错:", error);
        setError(`发送消息时出错: ${error instanceof Error ? error.message : String(error)}`);
      })
      .finally(() => {
        console.log("[InterviewChat] 请求处理完成，重置加载状态");
        setIsLoading(false);
        setIsGeneratingReasoning(false);
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
  
  // 使用类名选择器而非ref或id
  const renderMessage = (message: Message, index: number) => {
    const isUser = message.role === "user";
    const isLatestAssistantMessage = !isUser && index === messages.length - 1;
    
    return (
      <div key={index} className={cn("flex", { "justify-end": isUser, "justify-start": !isUser })}>
        <div className="relative flex items-start">
          {!isUser && (
            <Avatar className="mt-1 mr-2 flex-shrink-0">
              <div className="w-full h-full bg-primary text-white flex items-center justify-center font-bold">
                VO
              </div>
            </Avatar>
          )}
          
          <div className="flex flex-col max-w-md">
            {/* 实际消息内容 */}
            <div
              className={cn(
                "px-4 py-2 rounded-lg",
                { "bg-primary text-primary-foreground": isUser },
                { "bg-card border": !isUser }
              )}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
              {!isUser && (
                <div className="mt-2 pt-2 border-t">
                  <SpeechOutput
                    text={message.content}
                    autoplay={isLatestAssistantMessage}
                    language={localeLang}
                    voice={systemVoice}
                    data-auto-play={isLatestAssistantMessage}
                  />
                </div>
              )}
            </div>
          </div>
          
          {isUser && (
            <Avatar className="mt-1 ml-2 flex-shrink-0">
              <div className="w-full h-full bg-background border text-foreground flex items-center justify-center font-bold">
                Me
              </div>
            </Avatar>
          )}
        </div>
      </div>
    );
  };
  
  // 渲染思考侧边栏
  const renderThoughtSidebar = () => {
    // 获取所有助手消息，用于显示历史思考
    const assistantMessages = messages
      .filter(m => m.role === "assistant" && (m.reasoning || m.analysis))
      .reverse(); // 最新的思考在前面
    
    if (assistantMessages.length === 0) {
      return (
        <div className="px-4 py-6 text-center text-muted-foreground">
          Visa officer's thoughts will be displayed here
        </div>
      );
    }
    
    // 当前最新的思考
    const lastAssistantMsg = assistantMessages[0];
    
    return (
      <div className="p-4 space-y-6 overflow-y-auto">
        <h3 className="text-lg font-semibold">Visa Officer's Thoughts</h3>
        
        {/* 最新的思考 */}
        <div className="space-y-4">
          <div className="font-medium text-sm flex items-center justify-between">
            <span>Current Thoughts</span>
            <span className="text-xs bg-primary/10 px-2 py-1 rounded-full">Latest</span>
          </div>
          
          {lastAssistantMsg.analysis && (
            <div className="space-y-4">
              {/* 正面信号 */}
              {lastAssistantMsg.analysis.goodSignals.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-green-600 flex items-center">
                    <div className="w-2 h-2 rounded-full bg-green-600 mr-2"></div>
                    Positive Signals
                  </h4>
                  <ul className="space-y-1 text-sm">
                    {lastAssistantMsg.analysis.goodSignals.map((signal: string, i: number) => (
                      <li key={i} className="border-l-2 border-green-200 pl-2 py-1 text-green-800">
                        {signal}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* 负面信号 */}
              {lastAssistantMsg.analysis.badSignals.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-red-600 flex items-center">
                    <div className="w-2 h-2 rounded-full bg-red-600 mr-2"></div>
                    Concerns
                  </h4>
                  <ul className="space-y-1 text-sm">
                    {lastAssistantMsg.analysis.badSignals.map((signal: string, i: number) => (
                      <li key={i} className="border-l-2 border-red-200 pl-2 py-1 text-red-800">
                        {signal}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* 不明确信息 */}
              {lastAssistantMsg.analysis.unclear.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-amber-600 flex items-center">
                    <div className="w-2 h-2 rounded-full bg-amber-600 mr-2"></div>
                    Unclear Information
                  </h4>
                  <ul className="space-y-1 text-sm">
                    {lastAssistantMsg.analysis.unclear.map((item: string, i: number) => (
                      <li key={i} className="border-l-2 border-amber-200 pl-2 py-1 text-amber-800">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* 下一步 */}
              {lastAssistantMsg.analysis.nextSteps && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-blue-600 flex items-center">
                    <div className="w-2 h-2 rounded-full bg-blue-600 mr-2"></div>
                    Next Steps
                  </h4>
                  <div className="border-l-2 border-blue-200 pl-2 py-1 text-sm text-blue-800">
                    {lastAssistantMsg.analysis.nextSteps}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* 原始思考过程 */}
          <div className="mt-2">
            <details>
              <summary className="text-sm font-medium text-muted-foreground cursor-pointer">
                View Full Thought Process
              </summary>
              <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {lastAssistantMsg.reasoning}
              </div>
            </details>
          </div>
        </div>
        
        {/* 历史思考 */}
        {assistantMessages.length > 1 && (
          <div className="mt-6 pt-4 border-t">
            <h4 className="text-sm font-medium mb-3">Thought History</h4>
            <div className="space-y-4">
              {assistantMessages.slice(1).map((msg, index) => (
                <details key={index} className="border rounded-lg p-2">
                  <summary className="text-sm cursor-pointer">
                    Round {assistantMessages.length - index - 1} Thoughts
                  </summary>
                  <div className="mt-2 pt-2 border-t text-sm">
                    <div className="space-y-2">
                      {msg.analysis?.goodSignals && msg.analysis.goodSignals.length > 0 && (
                        <div>
                          <span className="text-green-600 font-medium">Positive Signals: </span>
                          <span>{msg.analysis.goodSignals.length} items</span>
                        </div>
                      )}
                      {msg.analysis?.badSignals && msg.analysis.badSignals.length > 0 && (
                        <div>
                          <span className="text-red-600 font-medium">Concerns: </span>
                          <span>{msg.analysis.badSignals.length} items</span>
                        </div>
                      )}
                      {msg.analysis?.unclear && msg.analysis.unclear.length > 0 && (
                        <div>
                          <span className="text-amber-600 font-medium">Unclear: </span>
                          <span>{msg.analysis.unclear.length} items</span>
                        </div>
                      )}
                      <details>
                        <summary className="cursor-pointer text-xs text-muted-foreground">
                          View Details
                        </summary>
                        <div className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                          {msg.reasoning}
                        </div>
                      </details>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}
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

  // 思考过程分析函数
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

  return (
    <div className="flex flex-col h-[80vh]">
      {isStarted ? (
        <div className="flex flex-col flex-grow overflow-hidden">
          {renderInterviewHeader()}
          
          <div className="flex flex-grow overflow-hidden">
            {/* 主要对话区域 */}
            <div className="flex-grow flex flex-col overflow-hidden border-r">
              {/* 消息列表 */}
              <div className="flex-grow overflow-y-auto p-4 space-y-4">
                {messages.filter(m => m.role !== "system").map(renderMessage)}
                <div ref={messagesEndRef} />
              </div>
              
              {/* 输入区域 */}
              <div className="p-4 border-t">
                {error && <div className="text-red-500 mb-2 text-sm">{error}</div>}
                <form onSubmit={handleSubmit} className="flex items-center space-x-2">
                  {/* 思考过程生成状态指示器 */}
                  {isGeneratingReasoning && (
                    <div className="text-sm text-muted-foreground animate-pulse mr-2">
                      Visa officer is thinking...
                    </div>
                  )}
                  
                  <div className="flex-grow flex items-center space-x-2">
                    {/* 文本输入 */}
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Enter your response..."
                      className="flex-grow"
                      disabled={isLoading || isGeneratingReasoning}
                    />
                    
                    {/* 语音输入组件 */}
                    <SpeechInput
                      onResult={handleSpeechResult}
                      onSubmit={handleSpeechSubmit}
                      disabled={isLoading}
                      placeholder="Click microphone to speak"
                    />
                  </div>
                  
                  <Button 
                    type="submit" 
                    disabled={isLoading || isGeneratingReasoning || !input.trim()} 
                    className="shrink-0"
                  >
                    {isLoading ? "Sending..." : "Send"}
                  </Button>
                </form>
              </div>
            </div>
            
            {/* 思考过程侧边栏 */}
            <div className="w-1/3 border-l bg-muted/30 overflow-y-auto">
              {renderThoughtSidebar()}
            </div>
          </div>
        </div>
      ) : (
        renderConfigForm()
      )}
      
      {/* 反馈对话框 */}
      <Dialog open={showFeedback} onOpenChange={closeFeedbackDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Interview Feedback</DialogTitle>
            <DialogDescription>
              Our AI has evaluated your performance in this interview
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap">
            {feedback}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 