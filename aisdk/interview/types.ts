/**
 * 面试消息类型
 */
export type InterviewMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * 面试配置选项
 */
export type InterviewOptions = {
  visaType?: string;        // 签证类型
  interviewType?: string;   // 面试类型
  travelPurpose?: string;   // 旅行目的
  language?: string;        // 面试语言
  difficulty?: string;      // 面试难度
};

/**
 * 自定义流式模型接口
 */
export interface StreamModel {
  generateStreamText: (options: { signal?: AbortSignal }) => Promise<{
    text: () => Promise<string>;
    onTextContent: (callback: (content: string) => void) => () => void;
  }>;
} 