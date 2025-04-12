import { NextRequest } from "next/server";
import { generateInterviewFeedback, InterviewMessage, InterviewOptions } from "@/aisdk/interview";
import { respData, respErr } from "@/lib/resp";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { messages, options } = await req.json();
    
    // Validate input
    if (!Array.isArray(messages) || messages.length === 0) {
      return respErr("Invalid message format");
    }
    
    // Generate feedback
    const feedback = await generateInterviewFeedback(
      messages as InterviewMessage[],
      options as InterviewOptions
    );
    
    // Return feedback data
    return respData({ feedback });
  } catch (error) {
    console.error("Feedback API error:", error);
    return respErr("Error generating interview feedback");
  }
} 