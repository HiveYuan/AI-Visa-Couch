import { NextRequest } from "next/server";
import { generateInterviewFeedback, InterviewMessage, InterviewOptions } from "@/aisdk/interview";
import { respData, respErr } from "@/lib/resp";

export async function POST(req: NextRequest) {
  try {
    const { messages, options } = await req.json();
    
    // 验证输入
    if (!Array.isArray(messages) || messages.length < 3) { // 至少需要系统消息、一条用户消息和一条助手消息
      return respErr("无效的消息格式或消息数量不足");
    }
    
    // 生成面试反馈
    const feedback = await generateInterviewFeedback(
      messages as InterviewMessage[],
      options as InterviewOptions
    );
    
    return respData({ feedback });
  } catch (error) {
    console.error("生成面试反馈API错误:", error);
    return respErr("生成面试反馈时出错");
  }
} 