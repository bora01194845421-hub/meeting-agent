// 데모 실행: API 키 없이 샘플 데이터로 DOCX 생성
// 실행: "C:\Program Files\nodejs\node.exe" demo.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildMeetingDocument } from './templates/meeting-template.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');

// ── 샘플 트랜스크립트 ───────────────────────────────────
const rawTranscript = fs.readFileSync(
  path.join(__dirname, 'test/sample-transcript.txt'),
  'utf-8'
);

// ── Sub-Agent 2 결과 (모의 데이터) ─────────────────────
const analyzedData = {
  meeting_title: '2월 캠페인 준비 회의',
  participants: ['김팀장', '이기획', '박디자인'],
  sections: [
    {
      title: '기획안 현황 보고',
      content:
        '이기획 담당자가 소재 기획안 80% 완성 현황을 공유했으며, 1월 말까지 완료 예정임을 보고했습니다.',
      duration_estimate: '5분',
    },
    {
      title: '예산 확정',
      content:
        '김팀장이 지난번 승인된 500만원 예산을 최종 확정했습니다.',
      duration_estimate: '3분',
    },
    {
      title: '디자인 일정 논의',
      content:
        '박디자인 담당자가 기획안 수령 즉시 작업에 착수하여 2월 5일까지 완료 가능함을 확인했습니다.',
      duration_estimate: '5분',
    },
    {
      title: '결정사항 정리 및 마무리',
      content:
        '예산 500만원 확정, 기획안 1월 31일 마감, 디자인 2월 5일 마감으로 최종 결정했습니다.',
      duration_estimate: '2분',
    },
  ],
};

// ── Sub-Agent 3 결과 (모의 데이터) ─────────────────────
const extractedData = {
  summary:
    '2월 캠페인 준비를 위해 예산 500만원이 확정되었습니다. 기획안은 1월 31일, 디자인 작업은 2월 5일을 마감으로 설정했습니다. 다음 회의는 2월 3일 오전 10시에 진행 예정입니다.',
  decisions: [
    '2월 캠페인 예산 500만원 확정',
    '소재 기획안 마감: 2025년 1월 31일',
    '디자인 작업 마감: 2025년 2월 5일',
  ],
  action_items: [
    {
      task: '소재 기획안 최종 완료 및 박디자인에게 전달',
      assignee: '이기획',
      due_date: '2025-01-31',
      priority: 'high',
    },
    {
      task: '캠페인 디자인 작업 완료',
      assignee: '박디자인',
      due_date: '2025-02-05',
      priority: 'high',
    },
    {
      task: '2월 3일 다음 회의 일정 공유 및 안건 준비',
      assignee: '김팀장',
      due_date: '2025-02-01',
      priority: 'medium',
    },
  ],
  next_meeting: '2025년 2월 3일 오전 10시',
};

// ── DOCX 생성 ─────────────────────────────────────────
async function runDemo() {
  console.log('🎬 데모 모드: API 없이 샘플 데이터로 DOCX 생성 중...\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const now = new Date();
  const timePart = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const fileName = `회의록_20250115_${timePart}_DEMO.docx`;
  const filePath = path.join(OUTPUT_DIR, fileName);

  const buffer = await buildMeetingDocument({
    analyzedData,
    extractedData,
    meetingDate: '2025-01-15',
    rawTranscript,
  });

  fs.writeFileSync(filePath, buffer);

  console.log(`✅ 완료! 파일 위치:\n   ${path.resolve(filePath)}`);
}

runDemo().catch((err) => {
  console.error('오류:', err.message);
  process.exit(1);
});
