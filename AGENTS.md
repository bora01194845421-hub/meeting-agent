# 서브에이전트 명세서 (AGENTS.md)

각 서브에이전트의 역할, 입출력 스키마, 구현 지침을 정의합니다.

---

## 오케스트레이터 (orchestrator.js)

**역할**: 전체 파이프라인 조율. 서브에이전트를 순서대로 호출하고 결과를 다음 에이전트에 전달.

**구현 지침**:
- 각 서브에이전트를 `await` 순차 호출 (병렬 아님 — 앞 결과가 뒤 입력)
- 각 단계 시작/완료 시 콘솔에 진행 상황 출력 (`[1/4] 음성 변환 중...`)
- 에이전트 실패 시 에러 메시지 + 어느 단계에서 실패했는지 출력 후 중단

**입력**:
```js
{
  inputFile: string,      // 오디오 또는 텍스트 파일 경로
  meetingDate: string,    // "2025-01-15" 형식
  meetingTitle: string,   // 선택. 없으면 AI가 자동 생성
  skipTranscription: boolean  // true면 Sub-Agent 1 스킵
}
```

**출력**: `output/회의록_YYYYMMDD.docx` 파일 경로

---

## Sub-Agent 1: 트랜스크라이버 (transcriber.js)

**역할**: 오디오 파일을 Whisper API로 텍스트 변환. 화자 분리 시도.

**구현 지침**:
- `openai` 패키지의 `audio.transcriptions.create` 사용
- 모델: `whisper-1`
- `response_format: "verbose_json"` 으로 타임스탬프 포함 요청
- 파일이 텍스트(.txt, .md)이면 Whisper 호출 없이 파일을 그대로 읽어 반환
- 지원 오디오 형식: mp3, mp4, wav, m4a, webm

**입력**: 오디오 파일 경로 (string)

**출력**:
```json
{
  "transcript": "전체 텍스트...",
  "language": "ko",
  "segments": [
    { "start": 0.0, "end": 5.2, "text": "안녕하세요..." }
  ]
}
```

---

## Sub-Agent 2: 분석기 (analyzer.js)

**역할**: 원문 텍스트를 Claude API로 분석해 주제별 섹션으로 구조화.

**구현 지침**:
- `@anthropic-ai/sdk` 패키지 사용
- 모델: `claude-sonnet-4-5`
- 시스템 프롬프트: `prompts/analyze.txt` 파일 로드
- 응답은 반드시 JSON만 반환하도록 프롬프트 지시
- `max_tokens: 4096`

**시스템 프롬프트 (prompts/analyze.txt)에 포함할 내용**:
```
당신은 회의 내용을 분석하는 전문가입니다.
주어진 회의 녹취 텍스트를 분석하여 아래 JSON 형식으로만 응답하세요.
다른 텍스트나 마크다운 코드블록 없이 순수 JSON만 출력하세요.
```

**입력**: `{ transcript: string }`

**출력**:
```json
{
  "meeting_title": "2025년 1분기 마케팅 전략 회의",
  "participants": ["김철수 (팀장)", "이영희 (기획)", "박민준 (디자인)"],
  "sections": [
    {
      "title": "지난 분기 성과 리뷰",
      "content": "...",
      "duration_estimate": "10분"
    }
  ]
}
```

---

## Sub-Agent 3: 추출기 (extractor.js)

**역할**: 구조화된 회의 내용에서 결정사항, 액션아이템, 핵심 요약을 추출.

**구현 지침**:
- 모델: `claude-sonnet-4-5`
- 시스템 프롬프트: `prompts/extract.txt` 파일 로드
- 액션아이템은 반드시 담당자와 기한을 포함하도록 프롬프트 지시
- 응답은 JSON만 반환

**시스템 프롬프트 (prompts/extract.txt)에 포함할 내용**:
```
당신은 회의 내용에서 핵심 정보를 추출하는 전문가입니다.
결정사항, 액션아이템(담당자/기한 포함), 핵심 요약을 추출하세요.
순수 JSON 형식으로만 응답하세요.
```

**입력**: Sub-Agent 2의 출력 JSON (string으로 직렬화하여 전달)

**출력**:
```json
{
  "summary": "이번 회의에서는 1분기 마케팅 예산 조정 및 신규 캠페인 방향을 논의했습니다.",
  "decisions": [
    "SNS 광고 예산을 20% 증액하기로 결정",
    "3월 론칭 캠페인 주제를 '봄맞이 프로모션'으로 확정"
  ],
  "action_items": [
    {
      "task": "SNS 광고 소재 3종 제작",
      "assignee": "박민준",
      "due_date": "2025-01-31",
      "priority": "high"
    },
    {
      "task": "예산 증액 품의서 작성",
      "assignee": "이영희",
      "due_date": "2025-01-20",
      "priority": "high"
    }
  ],
  "next_meeting": "2025-02-05 오전 10시"
}
```

---

## Sub-Agent 4: 문서 작성기 (docWriter.js)

**역할**: 추출된 모든 정보를 템플릿에 맞춰 DOCX 파일로 생성.

**구현 지침**:
- `docx` npm 패키지 사용 (`npm install docx`)
- 템플릿 정의는 `templates/meeting-template.js`에 분리
- 파일명: `회의록_YYYYMMDD_HHMMSS.docx`
- 저장 경로: `output/` 폴더 (없으면 자동 생성)
- A4 사이즈, 여백 25mm

**입력**:
```js
{
  analyzedData: { /* Sub-Agent 2 출력 */ },
  extractedData: { /* Sub-Agent 3 출력 */ },
  meetingDate: "2025-01-15",
  rawTranscript: "..." // 원문 첨부용
}
```

**출력**: 생성된 DOCX 파일의 절대 경로 (string)
