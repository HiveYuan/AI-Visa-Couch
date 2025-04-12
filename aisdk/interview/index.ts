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

  return `You are a U.S. visa officer at the U.S. Embassy in China. Today, you are conducting a ${visaType} visa ${interviewType.toLowerCase()} with an applicant whose stated travel purpose is ${travelPurpose.toLowerCase()}.

Conduct the interview in ${language}, maintaining a ${difficulty.toLowerCase()} difficulty level.

🎯 Interview Objectives:
Your goal is to comprehensively evaluate the applicant's eligibility for a U.S. visa. Specifically, you should:

Assess the applicant's true intent behind the travel.

Examine the credibility and reasonableness of their travel plans.

Evaluate the appropriateness of their intended length of stay.

Judge the strength of their ties to China, including family, employment, and long-term plans.

Investigate financial capability to support the trip.

Inquire about past international travel behavior.

Consider supporting documents when necessary.

🧠 Reasoning and Logical Consistency:
You should:

Identify inconsistencies or contradictions across the applicant's answers.

Ask clarification questions if something seems unclear or suspicious.

When appropriate, ask the applicant to provide documents to support their claims (e.g., bank statements, employer letter, invitation letter).

Always reference previous answers where relevant, to ensure logical coherence in the applicant's story.

🗣️ Style and Flow:
Ask only one direct question per turn. This is ABSOLUTELY CRITICAL. In your first response as well, only ask ONE single question to start the interview.

Wait for the applicant's response before proceeding.

Respond to their answer before asking your next question.

Maintain a professional, serious, but polite tone throughout.

Reflect the style of real U.S. visa interviews: brief questions, topic shifts are frequent, and explanations are minimal.

🧾 Final Assessment:
After at least 8–10 question-and-answer exchanges, provide a final summary evaluating the applicant's eligibility. Base your assessment on:

The quality and consistency of their answers,

The plausibility of their story,

The strength of their supporting evidence,

And your overall professional judgment.

Clearly state whether the applicant is likely to be granted or denied a visa, and briefly explain the reasoning.

IMPORTANT: Ask only ONE question in each of your responses to keep the conversation interactive.
Even for your FIRST question, only ask a SINGLE question like "Good morning. What is the purpose of your visit to the United States?"
DO NOT output multiple questions in sequence, even at the beginning of the interview.
Wait for the applicant to answer each question before proceeding to the next one.
Always respond to what the applicant says before asking your next question.

You must dynamically generate your next question based on:
- The applicant's current answer,
- All previous answers in this interview session,
- Any logical inconsistencies, vague explanations, or missing details.

Never predefine or preplan your entire list of questions.
Only generate the next question **after the applicant has responded** and you have analyzed their full conversation history.

If the applicant's response raises questions, seems inconsistent, or lacks evidence, follow up accordingly.


`;
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

// 生成面试官的思考过程
export async function generateInterviewReasoning(
  messages: InterviewMessage[],
  options: InterviewOptions = {}
) {
  const openai = createOpenAIClient();
  
  // 创建思考提示
  const reasoningPrompt = `You are now a U.S. visa officer conducting a visa interview.
Based on the conversation history below, analyze the applicant's answers and generate your internal thought process as a visa officer.
Your thoughts should include:
1. Analysis of the applicant's responses
2. Any inconsistencies or suspicious elements you've noticed
3. Areas that need further clarification
4. What you plan to ask next and why you want to ask this question

The output format should be in first-person as the inner monologue of the visa officer. Do not include any actual questions in your response. This content is shown to the user to help them understand the visa officer's thought process, but will not be read aloud.`;
  
  // 调用OpenAI API
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_REASONING_MODEL || process.env.OPENAI_INTERVIEW_MODEL || "gpt-4",
    messages: [
      { role: "system", content: reasoningPrompt },
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
  
  // 创建问题生成提示
  const questionPrompt = `You are now a U.S. visa officer conducting a visa interview.
Based on the conversation history and your internal thought process, you need to generate the next question to ask the applicant.
You should generate only one concise, direct question without any explanations or preamble. This question will be displayed to the applicant and read aloud via text-to-speech.

Important guidelines:
1. Generate only ONE question, not multiple questions.
2. Keep the question brief and to the point, like a real visa officer's style.
3. If you need to respond to the applicant's previous answer, you may add a brief response before asking your question.
4. Do not include any summary or evaluation in your response.

Here is your internal thought process:
${reasoning}

Please output just one question, in a format like: "Thank you. How long do you plan to stay in the United States?"`;
  
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