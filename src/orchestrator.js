import fs from 'fs';
import { transcribe } from './agents/transcriber.js';
import { analyze }     from './agents/analyzer.js';
import { extract }     from './agents/extractor.js';
import { writeDoc }    from './agents/docWriter.js';

export async function run({ inputFile, meetingDate, meetingTitle, skipTranscription, manualFields = {}, _rawText }) {
  let transcriptResult;

  // ── [1/4] 음성 변환 ───────────────────────────────
  if (_rawText) {
    // 실시간 녹음 텍스트 직접 전달
    transcriptResult = { transcript: _rawText, language: 'ko', segments: [] };
    console.log('✓ [1/4] 텍스트 직접 수신 완료');
  } else if (skipTranscription) {
    console.log('⟳ [1/4] 텍스트 파일 로드 중...');
    try {
      const text = fs.readFileSync(inputFile, 'utf-8');
      transcriptResult = { transcript: text, language: 'ko', segments: [] };
    } catch (err) {
      console.error(`❌ [음성 변환] 실패: ${err.message}`);
      process.exit(1);
    }
    console.log('✓ [1/4] 완료');
  } else {
    console.log('⟳ [1/4] 음성 변환 중...');
    transcriptResult = await transcribe(inputFile);
    console.log('✓ [1/4] 완료');
  }

  const rawTranscript = transcriptResult.transcript;

  // ── [2/4] 내용 분석 ───────────────────────────────
  console.log('⟳ [2/4] 회의 내용 분석 중...');
  let analyzedData = await analyze({ transcript: rawTranscript });
  if (meetingTitle) analyzedData.meeting_title = meetingTitle;
  console.log('✓ [2/4] 완료');

  // ── [3/4] 핵심 정보 추출 ─────────────────────────
  console.log('⟳ [3/4] 결정사항 및 액션아이템 추출 중...');
  let extractedData = await extract(analyzedData);

  // 수동 입력값 오버라이드
  if (manualFields.project_name)          extractedData.project_name = manualFields.project_name;
  if (manualFields.venue)                 extractedData.venue = manualFields.venue;
  if (manualFields.external_participants) extractedData.external_participants = manualFields.external_participants;
  if (manualFields.internal_participants) extractedData.internal_participants = manualFields.internal_participants;
  console.log('✓ [3/4] 완료');

  // ── [4/4] 문서 생성 ───────────────────────────────
  console.log('⟳ [4/4] DOCX 문서 생성 중...');
  const outputPath = await writeDoc({ analyzedData, extractedData, meetingDate, rawTranscript });
  console.log('✓ [4/4] 완료');

  console.log(`\n✅ 회의록 생성 완료: ${outputPath}`);
  return { outputPath, analyzedData, extractedData };
}
