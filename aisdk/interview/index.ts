import OpenAI from "openai";

// 面试消息类型
export type InterviewMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// 面试配置选项
export type InterviewOptions = {
  visaType?: string;        // 签证类型
  interviewType?: string;   // 面试类型
  travelPurpose?: string;   // 旅行目的
  language?: string;        // 面试语言
  difficulty?: string;      // 面试难度
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
    visaType = "B1/B2",
    interviewType = "标准面试",
    travelPurpose = "旅游",
    language = "中文",
    difficulty = "中等"
  } = options;

  return `你是一位美国驻华使领馆的签证官，正在进行${visaType}签证的${interviewType}。
申请人的旅行目的是${travelPurpose}。
请用${language}与申请人进行面试对话，难度设定为${difficulty}。
你的目标是评估申请人申请签证的真实意图、访美计划的合理性、在美停留时间的合理性，以及申请人与中国的联系纽带等。
面试过程中，请提出符合真实签证面试的问题，根据申请人的回答进行跟进提问。
保持专业、严肃但不失礼貌的态度。
每次回复控制在1-2个问题以内，保持对话的流畅性。
面试特点：问题简短直接，通常不做过多解释，快速切换话题是常见的。
在面试结束时，你将对申请人的表现进行简要评估，并给出是否可能获得签证的分析。`;
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
  const feedbackPrompt = `请根据以下美国签证面试对话，对申请人的表现进行全面评估。
评估内容包括：
1. 申请目的清晰度
2. 旅行计划的合理性
3. 经济能力与资金来源
4. 与中国的联系纽带
5. 回答的一致性与可信度
6. 语言表达能力

请提供具体的优势和需要改进的地方，以及最终的面试结果预测（很可能通过/需要提供更多材料/可能被拒签）。
此外，请给出改进建议，帮助申请人在真实面试中表现得更好。
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