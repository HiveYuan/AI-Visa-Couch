import { Metadata } from "next";
import InterviewChat from "@/components/interview/InterviewChat";

export const metadata: Metadata = {
  title: "美国签证面试模拟 | AI模拟训练",
  description: "与AI签证官进行真实的美国签证面试模拟对话，获取即时反馈和建议",
};

export default function InterviewPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6 text-center">美国签证面试模拟</h1>
      <div className="max-w-4xl mx-auto bg-card rounded-lg shadow-lg p-6">
        <InterviewChat />
      </div>
    </div>
  );
} 