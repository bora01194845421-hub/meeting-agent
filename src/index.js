// 사용 예시:
//   node src/index.js --input ./meeting.mp3 --date 2025-01-15
//   node src/index.js --input ./transcript.txt --skip-transcription

import 'dotenv/config';
import { program } from 'commander';
import { run } from './orchestrator.js';

program
  .name('meeting-agent')
  .description('회의 녹취 파일을 분석하여 DOCX 회의록을 자동 생성합니다.')
  .version('1.0.0')
  .requiredOption('-i, --input <path>', '오디오 또는 텍스트 파일 경로')
  .option('-d, --date <YYYY-MM-DD>', '회의 날짜 (기본값: 오늘)', new Date().toISOString().slice(0, 10))
  .option('-t, --title <string>', '회의 제목 (없으면 AI 자동 생성)')
  .option('--skip-transcription', '입력 파일을 이미 변환된 텍스트로 처리', false)
  .parse(process.argv);

const opts = program.opts();

run({
  inputFile:         opts.input,
  meetingDate:       opts.date,
  meetingTitle:      opts.title,
  skipTranscription: opts.skipTranscription,
}).catch((err) => {
  console.error('예상치 못한 오류:', err.message);
  process.exit(1);
});
