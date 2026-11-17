import type { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * 工具的最小抽象：一个名字 + 描述 + 参数JSON Schema + 一个run函数
 */
export interface Tool {
  name: string; // 名字
  description: string; // 描述
  
  /** OpenAI function 的 parameters 层（如 { type: 'object', properties, additionalProperties }） */
  parameters: Record<string, unknown>;

  run(args: Record<string, unknown>): Promise<string>|string;
}

// 定义工具函数，模型只会拿到这份清单里声明的函数。
export const TOOLS: Tool[] = [
  {
    name: "get_current_time",
    description: "获取当前本地时间（Asia/Shanghai）。",
    parameters: {type: 'object', properties: {}, additionalProperties:false},
    run: (args) => {
      return new Date().toLocaleString('zh-CN', {timeZone: "Asia/Shanghai"})
    },
  },
]

