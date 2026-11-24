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

// 把内部 Tool 转成 OpenAI Chat Completions 的 tools 参数格式
export function toOpenAITools(): ChatCompletionTool[] {
  return TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }
  }))
}

/**
 * 按名字执行工具。参数是模型生成的 JSON 字符串。
 * 任何报错都作为「结果文本」返回给模型——让模型自己读错误（失败自检后续会实现，先在这里埋线）。
 */
export async function execTool(name: string, argsJson: string): Promise<string> {
  const tool = TOOLS.find((t) => t.name == name);
  if(!tool) return `未知工具：${name}`;
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    return `参数不是合法 JSON：${argsJson}`;
  }

  try {
    return await tool.run(args);
  } catch (err) {
    return `工具执行失败：${(err as Error).message}`
  }
}