import { NextRequest } from "next/server";
import { generateInterviewReasoning, InterviewMessage, InterviewOptions } from "@/aisdk/interview";
import { respData, respErr } from "@/lib/resp";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { messages, options } = await req.json();
    
    // 验证输入
    if (!Array.isArray(messages) || messages.length === 0) {
      return respErr("Invalid message format");
    }
    
    // 生成签证官的思考过程
    const reasoning = await generateInterviewReasoning(
      messages as InterviewMessage[],
      options as InterviewOptions
    );
    
    // 返回思考过程
    return respData({
      reasoning
    });
  } catch (error) {
    console.error("Interview reasoning API error:", error);
    return respErr("Error generating interview reasoning");
  }
} 