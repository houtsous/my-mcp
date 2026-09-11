import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { loadPromptDirectory, loadPromptFile, parseEnvelopeData, renderPrompt } from './prompt-loader.js';

export const defaultPromptDirectory = fileURLToPath(new URL('../prompts/', import.meta.url));

export function buildServer(promptDirectory = process.env.PROMPT_CALL_PROMPTS_DIR || defaultPromptDirectory) {
  const server = new McpServer(
    { name: 'prompt-call', version: '0.1.0' },
    {
      instructions:
        'Each listed prompt comes from a Markdown file. Read the data argument description, assemble data from the user conversation, JSON-encode it, and invoke the prompt. Prompts without data accept no arguments.'
    }
  );

  for (const initial of loadPromptDirectory(promptDirectory)) {
    const metadata = { title: initial.title, description: initial.description };
    if (initial.inputExample === undefined) {
      server.registerPrompt(initial.call, metadata, () => {
        const current = loadPromptFile(initial.filePath);
        if (current.inputExample !== undefined) throw new Error(`Prompt ${current.call} 的参数范式已改变，请重启 prompt-call`);
        return { messages: [{ role: 'user', content: { type: 'text', text: renderPrompt(current) } }] };
      });
      continue;
    }

    const exampleText = JSON.stringify(initial.inputExample, null, 2);
    server.registerPrompt(
      initial.call,
      {
        ...metadata,
        argsSchema: z.object({
          data: z.string().describe(
            `按以下单条参数范式从用户会话组装数据，并传入标准 JSON 字符串。单条指令传单值，多条独立指令传同结构数组：\n${exampleText}`
          )
        })
      },
      ({ data }) => {
        const current = loadPromptFile(initial.filePath);
        if (current.inputExample === undefined) throw new Error(`Prompt ${current.call} 的参数范式已改变，请重启 prompt-call`);
        const envelope = parseEnvelopeData(current.call, data, current.inputExample);
        return { messages: [{ role: 'user', content: { type: 'text', text: renderPrompt(current, envelope) } }] };
      }
    );
  }
  return server;
}

