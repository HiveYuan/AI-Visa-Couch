import { NextRequest } from "next/server";
import { conductInterviewChat, InterviewMessage, InterviewOptions } from "@/aisdk/interview";
import { respErr } from "@/lib/resp";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { messages, options } = await req.json();
    
    // 验证输入
    if (!Array.isArray(messages) || messages.length === 0) {
      return respErr("Invalid message format");
    }
    
    // 直接返回流式响应
    return conductInterviewChat(
      messages as InterviewMessage[],
      options as InterviewOptions
    );
  } catch (error) {
    console.error("Interview API error:", error);
    return respErr("Error processing interview chat");
  }
} 