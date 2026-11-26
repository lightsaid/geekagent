import { createInterface } from "node:readline";
import { loadConfig } from "./config";
import { Chat } from "./chat";
import { err, out, paint } from "./color";

const config = loadConfig();

const chat = new Chat(config.baseURL, config.apiKey, config.model)

const r1 = createInterface({ input: process.stdin, output: process.stdout })

//  用彩色提示符标注「用户输入」这一侧
r1.setPrompt(paint('user', 'You › '));

let busy = false;

function printHelp(): void {
  out('sys', `可用命令：
    /help 显示帮助
    /reset 清空本轮对话记忆
    /exit 退出（等价于Ctrl+c / Ctrl+D）
    输入任意内容即可与模型对话。`, true);
}

r1.on('line', async (raw) => {
  if (busy) return; // 上一轮还在流式输出，忽略连发输入
  busy = true;

  const line = raw.trim();
  if (line) {
    if (line.startsWith('/')) {
      switch (line) {
        case '/help':
          printHelp();
          break;
        case '/reset':
          chat.reset();
          out('sys', '（已清空对话记忆）', true);
          break;
        case '/exit':
          r1.close();
          return;
        default:
          out('sys', `未知命令：${line}（输入 /help 查看）`, true)
      }
    } else {
      try {
        out('sys', '\n'); // 模型回复另起一行
        
        // 把问题文本丢给模型，然后通过生成器流式接受模型返回内容
        for await (const delta of chat.streamReply(line)) {
          out(delta.startsWith('\n[调用工具') ? 'tool' : 'model', delta);
        }

        // 回答完毕，换行
        out('sys', '\n')
      } catch (e) {
        err('sys', `\n请求失败: ${(e as Error).message}`)
      }
    }
  }

  busy = false;
  r1.prompt();
})

r1.on('close', () => {
  out('sys', 'bye', true)
  process.exit(0);
})

out('sys', `GeekAgent Day 1 —— 最简单的 Agent（模型：${config.model}，输入 /help 查看命令）`, true);
r1.prompt();




/**
  运行 npm run dev -- day01/index.ts
  测试 /help、/reset、/exit
  随便给一个apiKey，提问会报错
  请求失败: 401 Authentication Fails, Your api key: ****-xxx is invalid (request_id: 04xxxxx)


  去到 https://www.deepseek.com 找到 API开发平台，创建API Key，还需要充钱，不如报错402 账户余额不足
*/



