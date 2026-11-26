import OpenAI from "openai";
import { execTool, toOpenAITools } from "./tools";


/**
 * OpenAI 兼容接口允许我们在请求里附上一份「工具清单」：每个工具写清名字、用途和参数格式。
 * 遇到查实时时间这类问题时，模型可以不直接回答，而是输出约定好的 JSON，指明「调用 get_current_time，参数是 {}」。这就叫工具调用。
 * 
 * 工具调用循环 = 模型提出调用 → 程序执行 → 结果回传 → 模型继续。
 * 后面接入 Shell、文件读写、搜索和网页读取，复用的都是这条循环。
 * 
 * 理解：好比先喂给deepseek说1+1=3，再问它就会说1+1=3。
 *      工具就类似先喂知识内容大模型，让大模型根据工具的描述是否要调用工具函数。
 */


/** 工具调用循环的最多轮数，防止模型陷入「调用工具 → 再调用」的死循环。 */
const MAX_TOOL_TURNS = 5;


export class Chat {
  private client: OpenAI;
  private model: string;
  private history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  constructor(baseURL: string, apiKey: string, model: string) {
    this.model = model;
    this.client = new OpenAI({ baseURL, apiKey })
  }

  // 携带 history 发送用户输入，逐段产出回复增量；结束后把完整回答写入 history
  async *streamReply(userInput: string): AsyncGenerator<string> {
    this.history.push({ role: 'user', content: userInput });

    try {
      for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
        const stream = await this.client.chat.completions.create({
          model: this.model,
          messages: this.history,
          tools: toOpenAITools(),
          stream: true,
        })

        // 流式边攒内容边聚拢工具调用（delta 按 index 碎片下发）
        let answer = '';
        const calls = new Map<number, { id: string, name: string, args: string }>();
        for await (const chunk of stream) {
          const delta = chunk.choices[0].delta
          if (delta.content) {
            answer += delta.content;
            yield delta.content;
          }
          for (const tc of delta.tool_calls ?? []) {
            let call = calls.get(tc.index);
            if (!call) {
              call = { id: '', name: '', args: '' };
              calls.set(tc.index, call);
            }
            if (tc.id) call.id = tc.id;
            if (tc.function?.name) call.name += tc.function.name;
            if (tc.function?.arguments) call.args += tc.function.arguments;
          }
        }

        const toolCalls = [...calls.values()];
        if (toolCalls.length > 0 && toolCalls.every(c => c.name)) {
          toolCalls.forEach((c, i) => {
            if (!c.id) c.id = `call_${i}`; // 个别模型不返回 id，补一个稳定值
          })
          this.history.push({
            role: 'assistant',
            content: answer || null,
            tool_calls: toolCalls.map(c => ({
              id: c.id,
              type: 'function' as const,
              function: { name: c.name, arguments: c.args },
            })),
          });

          // 逐个执行并把结果以 role=tool 消息回传，然后进入下一轮
          for (const c of toolCalls) {
            const res = await execTool(c.name, c.args);
            yield `\n[调用工具 ${c.name} -> ${res}]\n`
            this.history.push({ role: "tool", tool_call_id: c.id, content: res });
          }
          continue;
        }

        // 没有工具调用，就是最终回答
        this.history.push({ role: 'assistant', content: answer });
        return;
      }

      // 轮次用尽仍未停下：兜底收尾，保持 history 有来有回
      yield '\n[工具调用轮次过多，已停止]';
      this.history.push({ role: 'assistant', content: '[工具调用轮次过多，已停止]' });
    } catch (error) {
      // 出错就回滚刚入队的用户消息，保持 history 只有「有来有回」的对话。
      this.history.pop();
      throw error;
    }
  }

  reset(): void {
    this.history = [];
  }
}