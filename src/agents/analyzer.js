import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.join(__dirname, '../../prompts/analyze.txt');

export async function analyze({ transcript }) {
  try {
    const systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `다음 회의 녹취록을 분석해주세요:\n\n${transcript}`,
        },
      ],
    });

    const text = response.content[0].text.trim();

    try {
      return JSON.parse(text);
    } catch {
      // JSON 파싱 실패 시 코드블록 제거 후 재시도
      const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
      return JSON.parse(cleaned);
    }
  } catch (err) {
    throw new Error(`[Analyzer] ${err.message}`);
  }
}
