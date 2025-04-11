import OpenAI from "openai";

// 面试消息类型
export type InterviewMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// 面试配置选项
export type InterviewOptions = {
  jobTitle?: string;        // 面试职位
  jobLevel?: string;        // 职位级别（初级/中级/高级）
  interviewStage?: string;  // 面试阶段（技术面/HR面等）
  language?: string;        // 面试语言
  duration?: number;        // 预计面试时长（分钟）
};

// 自定义流式模型接口
interface StreamModel {
  generateStreamText: (options: { signal?: AbortSignal }) => Promise<{
    text: () => Promise<string>;
    onTextContent: (callback: (content: string) => void) => () => void;
  }>;
}

// 默认的系统提示词
const getDefaultSystemPrompt = (options: InterviewOptions = {}) => {
  const {
    jobTitle = "软件工程师",
    jobLevel = "中级",
    interviewStage = "技术面试",
    language = "中文",
  } = options;

  return `你是一位专业的${jobTitle}${jobLevel}岗位${interviewStage}面试官。
请用${language}与候选人进行面试对话。
你的目标是评估候选人的技能、经验和文化契合度。
面试过程中，请提出有针对性的问题，根据候选人的回答进行跟进提问。
保持专业、友好的态度，给予真实的反馈。
每次回复控制在2-3句话以内，保持对话的流畅性。
在面试结束时，你将对候选人的表现进行简要评估。`;
};

// 创建OpenAI客户端
const createOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }
  
  return new OpenAI({
    apiKey,
  });
};

// 进行面试对话
export async function conductInterviewChat(
  messages: InterviewMessage[],
  options: InterviewOptions = {}
) {
  const openai = createOpenAIClient();
  
  // 确保有系统消息
  if (!messages.some(m => m.role === "system")) {
    messages = [
      { role: "system", content: getDefaultSystemPrompt(options) },
      ...messages,
    ];
  }
  
  // 调用OpenAI API
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_INTERVIEW_MODEL || "gpt-3.5-turbo",
    messages,
    temperature: 0.7,
    max_tokens: 1000,
    stream: true,
  });
  
  // 返回流式响应
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      try {
        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            // 发送数据格式：{ type: "text", value: "内容" }
            const data = {
              type: "text",
              value: content
            };
            controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
          }
        }
        controller.close();
      } catch (error) {
        console.error("Stream处理错误:", error);
        controller.error(error);
      }
    }
  });
  
  return new Response(stream, {
    headers: {
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// 生成面试反馈
export async function generateInterviewFeedback(
  messages: InterviewMessage[],
  options: InterviewOptions = {}
) {
  const openai = createOpenAIClient();
  
  // 创建反馈提示
  const feedbackPrompt = `请根据以下面试对话，对候选人的表现进行全面评估。
评估内容包括：技术能力、沟通能力、经验相关性、文化契合度等方面。
请提供具体的优势和改进点，以及最终的面试结果建议（通过/需要进一步评估/不推荐）。
`;
  
  // 调用OpenAI API
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_FEEDBACK_MODEL || "gpt-3.5-turbo",
    messages: [
      { role: "system", content: feedbackPrompt },
      ...messages.filter(m => m.role !== "system"), // 排除系统消息
    ],
    temperature: 0.5,
    max_tokens: 1500,
  });
  
  return response.choices[0].message.content;
} 