import { NextRequest } from "next/server";
import { generateNextQuestion, InterviewMessage, InterviewOptions } from "@/aisdk/interview";
import { respData, respErr } from "@/lib/resp";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { reasoning, messages, options } = await req.json();
    
    // 验证输入
    if (!reasoning || typeof reasoning !== "string") {
      return respErr("Invalid reasoning format");
    }
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return respErr("Invalid message format");
    }
    
    // 生成下一个问题
    const question = await generateNextQuestion(
      reasoning,
      messages as InterviewMessage[],
      options as InterviewOptions
    );
    
    // 返回问题
    return respData({
      question
    });
  } catch (error) {
    console.error("Next question API error:", error);
    return respErr("Error generating next question");
  }
} 