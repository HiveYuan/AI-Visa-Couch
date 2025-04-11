import { Metadata } from "next";
import InterviewChat from "@/components/interview/InterviewChat";

export const metadata: Metadata = {
  title: "AI面试官 | 模拟面试训练",
  description: "与AI面试官进行真实的面试对话训练，获取即时反馈和建议",
};

export default function InterviewPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6 text-center">AI面试官</h1>
      <div className="max-w-4xl mx-auto bg-card rounded-lg shadow-lg p-6">
        <InterviewChat />
      </div>
    </div>
  );
} 