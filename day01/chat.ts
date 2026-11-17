import OpenAI from "openai";


export class Chat {
  private client: OpenAI;
  private model: string;
  private history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

  constructor(baseURL: string, apiKey: string, model: string) {
    this.model = model;
    this.client = new OpenAI({baseURL, apiKey})
  }

  // 携带 history 发送用户输入，逐段产出回复增量；结束后把完整回答写入 history
  async *streamReply(userInput: string): AsyncGenerator<string> {
    this.history.push({role: 'user', content: userInput});

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: this.history,
        stream: true,
      })

      // 保持回答内容变量
      let answer = '';

      // for...of会执行next()提取结果value值返回给chunk
      for await (const chunk of stream) {
        // console.log("chunk: ", chunk)
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if(delta) {
          answer += delta;
          yield delta;
        }
      }

      // 添加到历史上下文
      this.history.push({role: 'assistant', content: answer})
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