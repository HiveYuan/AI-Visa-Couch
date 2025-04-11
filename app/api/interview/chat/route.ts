import { NextRequest } from "next/server";
import { conductInterviewChat, InterviewMessage, InterviewOptions } from "@/aisdk/interview";
import { respErr } from "@/lib/resp";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { messages, options } = await req.json();
    
    // 验证输入
    if (!Array.isArray(messages) || messages.length === 0) {
      return respErr("无效的消息格式");
    }
    
    // 直接返回流式响应
    return conductInterviewChat(
      messages as InterviewMessage[],
      options as InterviewOptions
    );
  } catch (error) {
    console.error("面试对话API错误:", error);
    return respErr("处理面试对话时出错");
  }
} 