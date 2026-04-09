import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { toFile } from 'openai';

const AUDIO_EXTENSIONS = ['.mp3', '.mp4', '.wav', '.m4a', '.webm'];
const TEXT_EXTENSIONS  = ['.txt', '.md'];

export async function transcribe(inputFilePath) {
  const ext = path.extname(inputFilePath).toLowerCase();

  try {
    // 텍스트 파일이면 바로 읽어서 반환
    if (TEXT_EXTENSIONS.includes(ext)) {
      const content = fs.readFileSync(inputFilePath, 'utf-8');
      return { transcript: content, language: 'ko', segments: [] };
    }

    if (!AUDIO_EXTENSIONS.includes(ext)) {
      throw new Error(`지원하지 않는 파일 형식입니다: ${ext}`);
    }

    // 오디오 파일은 OpenAI Whisper API 사용
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('오디오 파일 변환을 위해 OPENAI_API_KEY가 필요합니다.');
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const fileStream = fs.createReadStream(inputFilePath);
    const file = await toFile(fileStream, path.basename(inputFilePath));

    const response = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      response_format: 'verbose_json',
      language: 'ko',
    });

    return {
      transcript: response.text,
      language: response.language || 'ko',
      segments: (response.segments || []).map(seg => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
      })),
    };
  } catch (err) {
    throw new Error(`[Transcriber] ${err.message}`);
  }
}
