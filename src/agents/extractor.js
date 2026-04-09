import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.join(__dirname, '../../prompts/extract.txt');

export async function extract(analyzedData) {
  try {
    const systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: JSON.stringify(analyzedData),
        },
      ],
    });

    const text = response.content[0].text.trim();

    try {
      return JSON.parse(text);
    } catch {
      const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
      return JSON.parse(cleaned);
    }
  } catch (err) {
    throw new Error(`[Extractor] ${err.message}`);
  }
}
