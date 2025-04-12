import React, { useState } from "react";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import InterviewChat from "./InterviewChat";

interface InterviewPanelProps {
  scenario: "Student" | "Visitor";
  applicantProfile: any;
}

export default function InterviewPanel({ 
  scenario, 
  applicantProfile 
}: InterviewPanelProps) {
  const [showThoughts, setShowThoughts] = useState(false);
  const [feedbackText, setFeedbackText] = useState<string>("");

  const handleRequestFeedback = () => {
    // 实现反馈请求逻辑
  };

  const handleFeedbackGenerated = (feedback: string) => {
    // 处理生成的反馈
    setFeedbackText(feedback);
  };

  const handleRestart = () => {
    // 实现重启逻辑
  };

  return (
    <>
      <div className="mb-4 text-center">
        <h2 className="text-2xl font-bold mb-2">
          {scenario === "Student" 
            ? "美国学生签证面试模拟器 | U.S. Student Visa Interview Simulator" 
            : "美国访客签证面试模拟器 | U.S. Visitor Visa Interview Simulator"}
        </h2>
        <p className="text-muted-foreground">
          与我们的AI签证官练习您的签证面试 | Practice your visa interview with our AI visa officer
        </p>
      </div>

      <InterviewChat />

      <div className="mt-6 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Switch
            id="showThoughts"
            checked={showThoughts}
            onCheckedChange={setShowThoughts}
          />
          <Label htmlFor="showThoughts">显示面试官的想法 | Show Officer's Thoughts</Label>
        </div>
        
        <div className="flex space-x-2">
          <Button variant="outline" onClick={handleRestart}>重新开始 | Restart</Button>
          <Button onClick={handleRequestFeedback}>获取反馈 | Get Feedback</Button>
        </div>
      </div>
    </>
  );
} 