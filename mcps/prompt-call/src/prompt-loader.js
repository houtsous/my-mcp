import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

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

function loadDefaultSettings(filePath, call) {
  const settingsPath = join(dirname(filePath), '..', '..', 'default-setting.json');
  if (!existsSync(settingsPath)) return undefined;

  let settings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch (error) {
    throw new Error(`默认设置文件不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
  if (settings === null || Array.isArray(settings) || typeof settings !== 'object') {
    throw new Error('默认设置文件的顶层必须是 JSON 对象');
  }

  const common = settings.common;
  const promptItems = settings.prompt_items;

  if (common !== undefined && (common === null || Array.isArray(common) || typeof common !== 'object')) {
    throw new Error('default-setting.json 的 common 必须是 JSON 对象');
  }
  if (promptItems !== undefined && (promptItems === null || Array.isArray(promptItems) || typeof promptItems !== 'object')) {
    throw new Error('default-setting.json 的 prompt_items 必须是 JSON 对象');
  }

  const prompt = promptItems?.[call];
  if (common === undefined && prompt === undefined) return undefined;
  return { common, prompt };
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
    defaultSettings: loadDefaultSettings(filePath, call),
    inputExample: extractInputExample(markdown)
  };
}

export function loadPromptDirectory(promptDirectory) {
  const prompts = readdirSync(promptDirectory, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => loadPromptFile(join(promptDirectory, entry.name, `${entry.name}.md`)))
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
  let rendered = definition.markdown.trimEnd();
  if (definition.defaultSettings !== undefined) {
    rendered += `\n\n## 运行时默认设置\n\n以下内容来自未提交的 \`default-setting.json\`：\n\n\`\`\`json\n${JSON.stringify(definition.defaultSettings, null, 2)}\n\`\`\``;
  }
  if (envelope) {
    rendered += `\n\n## 本次调用输入\n\n\`\`\`json\n${JSON.stringify(envelope.data, null, 2)}\n\`\`\``;
  }
  return `${rendered}\n`;
}

