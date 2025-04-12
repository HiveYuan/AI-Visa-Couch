import OpenAI from "openai";
import { InterviewMessage, InterviewOptions, StreamModel } from "./types";
import { 
  getInterviewSystemPrompt, 
  ReasoningAnalystPrompts, 
  QuestionGeneratorPrompts, 
  FeedbackAnalystPrompts 
} from "./prompts";

// 重新导出类型，使其可以从外部导入
export type { InterviewMessage, InterviewOptions, StreamModel };

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
      { role: "system", content: getInterviewSystemPrompt(options) },
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
  
  // 调用OpenAI API
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_FEEDBACK_MODEL || "gpt-3.5-turbo",
    messages: [
      { role: "system", content: FeedbackAnalystPrompts.basePrompt },
      ...messages.filter(m => m.role !== "system"), // 排除系统消息
    ],
    temperature: 0.5,
    max_tokens: 1500,
  });
  
  return response.choices[0].message.content;
}

// 生成面试官的思考过程
export async function generateInterviewReasoning(
  messages: InterviewMessage[],
  options: InterviewOptions = {}
) {
  const openai = createOpenAIClient();
  
  // 调用OpenAI API
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_REASONING_MODEL || process.env.OPENAI_INTERVIEW_MODEL || "gpt-4",
    messages: [
      { role: "system", content: ReasoningAnalystPrompts.basePrompt },
      ...messages.filter(m => m.role !== "system"), // 排除系统消息
    ],
    temperature: 0.4,
    max_tokens: 1000,
  });
  
  return response.choices[0].message.content;
}

// 基于思考过程生成下一个问题
export async function generateNextQuestion(
  reasoning: string,
  messages: InterviewMessage[],
  options: InterviewOptions = {}
) {
  const openai = createOpenAIClient();
  
  // 使用问题生成器提示词生成完整提示
  const questionPrompt = QuestionGeneratorPrompts.getFullPrompt(reasoning);
  
  // 调用OpenAI API
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_QUESTION_MODEL || process.env.OPENAI_INTERVIEW_MODEL || "gpt-4",
    messages: [
      { role: "system", content: questionPrompt },
      ...messages.filter(m => m.role !== "system"), // 排除系统消息
    ],
    temperature: 0.7,
    max_tokens: 200,
  });
  
  return response.choices[0].message.content;
} 