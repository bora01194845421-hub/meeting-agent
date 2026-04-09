import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildMeetingDocument } from '../../templates/meeting-template.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '../../output');

export async function writeDoc({ analyzedData, extractedData, meetingDate, rawTranscript }) {
  try {
    // output 폴더 없으면 생성
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // 파일명: 회의록_YYYYMMDD_HHMMSS.docx
    const now = new Date();
    const datePart = meetingDate
      ? meetingDate.replace(/-/g, '')
      : now.toISOString().slice(0, 10).replace(/-/g, '');
    const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const fileName = `회의록_${datePart}_${timePart}.docx`;
    const filePath = path.join(OUTPUT_DIR, fileName);

    const buffer = await buildMeetingDocument({
      analyzedData,
      extractedData,
      meetingDate,
      rawTranscript,
    });

    fs.writeFileSync(filePath, buffer);

    return path.resolve(filePath);
  } catch (err) {
    throw new Error(`[DocWriter] ${err.message}`);
  }
}
