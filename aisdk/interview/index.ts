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
    interviewType = "Standard Interview",
    travelPurpose = "Tourism",
    language = "English",
    difficulty = "Medium"
  } = options;

  return `You are a visa officer at the U.S. Embassy in China, conducting a ${visaType} visa ${interviewType.toLowerCase()}.
The applicant's purpose of travel is ${travelPurpose.toLowerCase()}.
Please conduct the interview in ${language} with a difficulty level of ${difficulty.toLowerCase()}.
Your goal is to assess the applicant's true intent, the reasonableness of their travel plans, the appropriate length of stay, and their ties to China.

IMPORTANT: Ask only ONE question in each of your responses to keep the conversation interactive.
Wait for the applicant to answer each question before proceeding to the next one.
Always respond to what the applicant says before asking your next question.

During the interview, ask questions that reflect a real visa interview and follow up based on the applicant's responses.
Maintain a professional, serious but polite attitude.
Interview characteristics: questions are brief and direct, typically without much explanation, and rapid topic changes are common.

Only present the final assessment after at least 8-10 exchanges with the applicant.
The assessment should analyze whether they are likely to receive a visa based on their entire interview.`;
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
  const feedbackPrompt = `Please provide a comprehensive evaluation of the applicant's performance in the following U.S. visa interview dialogue.
Evaluate the following aspects:
1. Clarity of purpose
2. Reasonableness of travel plans
3. Financial capability and funding sources
4. Ties to their home country
5. Consistency and credibility of answers
6. Communication skills

Include specific strengths and areas for improvement, along with a final prediction of the interview outcome (likely approval / needs more documentation / likely denial).
Additionally, provide suggestions for improvement to help the applicant perform better in a real interview.
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