import { readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

function headingLevel(line) {
  const match = /^(#{1,6})\s+/.exec(line);
  return match?.[1]?.length;
}

function parseFrontmatter(markdown) {
  if (!markdown.startsWith('---\n')) return {};
  const end = markdown.indexOf('\n---\n', 4);
  if (end < 0) return {};

  const result = {};
  for (const line of markdown.slice(4, end).split(/\r?\n/)) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (match?.[1]) result[match[1]] = (match[2] ?? '').trim().replace(/^['"]|['"]$/g, '');
  }
  return result;
}

function firstTitle(markdown, fallback) {
  return /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() || fallback;
}

export function extractInputExample(markdown) {
  const lines = markdown.split(/\r?\n/);
  const inputIndex = lines.findIndex(line => /^#{1,6}\s+(?:接收输入|接受输入)\s*$/.test(line));
  if (inputIndex < 0) return undefined;

  const inputLevel = headingLevel(lines[inputIndex] ?? '') ?? 2;
  let sectionEnd = lines.length;
  for (let index = inputIndex + 1; index < lines.length; index += 1) {
    const level = headingLevel(lines[index] ?? '');
    if (level !== undefined && level <= inputLevel) {
      sectionEnd = index;
      break;
    }
  }

  const section = lines.slice(inputIndex + 1, sectionEnd);
  const jsonHeadingIndex = section.findIndex(line => /^#{1,6}\s+JSON\s*$/i.test(line));
  if (jsonHeadingIndex < 0) return undefined;

  const block = /```json\s*\r?\n([\s\S]*?)\r?\n```/i.exec(section.slice(jsonHeadingIndex + 1).join('\n'));
  if (!block?.[1]) throw new Error('“接收输入/接受输入 → JSON”下面缺少 JSON 代码块');

  try {
    return JSON.parse(block[1]);
  } catch (error) {
    throw new Error(`输入范式不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
}

export function loadPromptFile(filePath) {
  const markdown = readFileSync(filePath, 'utf8');
  const stem = basename(filePath, extname(filePath));
  const metadata = parseFrontmatter(markdown);
  const call = metadata.name || stem;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(call)) throw new Error(`Prompt 调用名不合法：${call}`);

  return {
    call,
    title: firstTitle(markdown, call),
    description: metadata.description || `加载 ${call} 提示词`,
    filePath,
    markdown,
    inputExample: extractInputExample(markdown)
  };
}

export function loadPromptDirectory(promptDirectory) {
  const prompts = readdirSync(promptDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map(entry => loadPromptFile(join(promptDirectory, entry.name)))
    .sort((left, right) => left.call.localeCompare(right.call));

  const names = new Set();
  for (const prompt of prompts) {
    if (names.has(prompt.call)) throw new Error(`Prompt 调用名重复：${prompt.call}`);
    names.add(prompt.call);
  }
  return prompts;
}

function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function validateData(data, example, path = 'data') {
  if (!Array.isArray(example) && Array.isArray(data)) {
    data.forEach((item, index) => validateData(item, example, `${path}[${index}]`));
    return;
  }

  const expectedType = jsonType(example);
  const actualType = jsonType(data);
  if (expectedType !== actualType) throw new Error(`${path} 类型错误：期望 ${expectedType}，实际 ${actualType}`);

  if (Array.isArray(example) && Array.isArray(data)) {
    if (example[0] !== undefined) data.forEach((item, index) => validateData(item, example[0], `${path}[${index}]`));
    return;
  }

  if (example !== null && data !== null && typeof example === 'object' && typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      if (!(key in example)) throw new Error(`${path}.${key} 不是允许的字段`);
      validateData(value, example[key], `${path}.${key}`);
    }
  }
}

export function parseEnvelopeData(call, rawData, example) {
  let data;
  try {
    data = JSON.parse(rawData);
  } catch (error) {
    throw new Error(`Prompt ${call} 的 data 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
  validateData(data, example);
  return { call, data };
}

export function renderPrompt(definition, envelope) {
  if (!envelope) return definition.markdown;
  return `${definition.markdown.trimEnd()}\n\n## 本次调用输入\n\n\`\`\`json\n${JSON.stringify(envelope.data, null, 2)}\n\`\`\`\n`;
}

