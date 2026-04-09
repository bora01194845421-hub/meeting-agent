# Claude Code 구현 가이드 (CLAUDE.md)

이 파일을 Claude Code에 넣고 아래 단계별 지시를 순서대로 실행하세요.

---

## 준비 단계: 프로젝트 초기화

Claude Code에게 전달할 첫 번째 프롬프트:

```
아래 내용을 참고해서 meeting-agent 프로젝트를 초기화해줘.

1. package.json 생성 (name: meeting-agent, type: module)
2. 의존성 설치:
   - @anthropic-ai/sdk
   - openai
   - docx
   - commander
   - dotenv
3. src/agents/ 폴더와 prompts/ 폴더, output/ 폴더 생성
4. .env.example 파일 생성 (ANTHROPIC_API_KEY, OPENAI_API_KEY)
```

---

## Step 1: Sub-Agent 1 — 트랜스크라이버 구현

```
AGENTS.md의 Sub-Agent 1 명세를 보고 src/agents/transcriber.js를 구현해줘.

요구사항:
- openai 패키지의 toFile() 헬퍼로 파일 스트림 처리
- 입력 파일 확장자가 txt/md이면 Whisper 호출 없이 fs.readFile로 바로 읽어서 반환
- 오디오 파일이면 whisper-1 모델, response_format: "verbose_json"으로 호출
- 반환 형식은 AGENTS.md의 출력 스키마 그대로
- 에러 발생 시 throw new Error(`[Transcriber] ${err.message}`)
```

---

## Step 2: Sub-Agent 2 — 분석기 구현

```
AGENTS.md의 Sub-Agent 2 명세를 보고 아래 두 파일을 구현해줘.

1. prompts/analyze.txt
   - 역할: 회의 녹취 텍스트를 분석하는 전문가
   - 지시: 주제별 섹션 분류, 참석자 추출, 대화 흐름 파악
   - 출력 형식: AGENTS.md의 출력 스키마를 그대로 명시
   - 강조: 순수 JSON만 출력, 마크다운 코드블록 사용 금지

2. src/agents/analyzer.js
   - @anthropic-ai/sdk 사용, claude-sonnet-4-5 모델
   - prompts/analyze.txt를 fs.readFile로 로드해 system 프롬프트로 사용
   - user 메시지: "다음 회의 녹취록을 분석해주세요:\n\n{transcript}"
   - 응답 JSON 파싱 후 반환 (파싱 실패 시 에러)
   - max_tokens: 4096
```

---

## Step 3: Sub-Agent 3 — 추출기 구현

```
AGENTS.md의 Sub-Agent 3 명세를 보고 아래 두 파일을 구현해줘.

1. prompts/extract.txt
   - 역할: 회의 내용에서 결정사항·액션아이템을 추출하는 전문가
   - 지시: decisions(결정사항 배열), action_items(담당자+기한+우선순위), summary(3줄 요약), next_meeting 추출
   - 출력 형식: AGENTS.md의 출력 스키마를 그대로 명시
   - 강조: 순수 JSON만 출력, 마크다운 코드블록 사용 금지

2. src/agents/extractor.js
   - @anthropic-ai/sdk 사용, claude-sonnet-4-5 모델
   - prompts/extract.txt를 system 프롬프트로 사용
   - user 메시지: JSON.stringify(analyzedData)를 전달
   - 응답 JSON 파싱 후 반환
   - max_tokens: 2048
```

---

## Step 4: Sub-Agent 4 — 문서 작성기 구현

```
TEMPLATE.md의 전체 명세를 보고 아래 두 파일을 구현해줘.

1. templates/meeting-template.js
   - docx 패키지 사용
   - buildMeetingDocument({ analyzedData, extractedData, meetingDate, rawTranscript }) 함수 export
   - TEMPLATE.md에 정의된 모든 섹션 구현 (헤더, 기본정보표, 요약, 논의내용, 결정사항, 액션아이템표, 푸터)
   - 액션아이템 표의 우선순위 셀 색상 처리 포함
   - Packer.toBuffer(doc)로 Buffer 반환

2. src/agents/docWriter.js
   - buildMeetingDocument import
   - output/ 폴더 없으면 fs.mkdirSync로 생성
   - 파일명: 회의록_YYYYMMDD_HHMMSS.docx
   - Buffer를 fs.writeFileSync로 저장
   - 저장된 절대 경로 반환
```

---

## Step 5: 오케스트레이터 구현

```
AGENTS.md의 오케스트레이터 명세와 PLAN.md의 워크플로우를 보고
src/orchestrator.js를 구현해줘.

요구사항:
- 네 서브에이전트를 순서대로 await 호출
- 각 단계 시작 시 콘솔 출력: "⟳ [1/4] 음성 변환 중..."
- 각 단계 완료 시 콘솔 출력: "✓ [1/4] 완료"
- skipTranscription: true이면 Step 1 건너뛰고 inputFile을 텍스트로 읽어 사용
- 최종 완료 시 출력: "✅ 회의록 생성 완료: {파일경로}"
- 에러 발생 시: "❌ [{단계}] 실패: {에러메시지}" 출력 후 process.exit(1)
```

---

## Step 6: CLI 진입점 구현

```
src/index.js를 구현해줘.

commander 패키지로 아래 CLI 옵션 처리:
  --input <path>         필수. 오디오 또는 텍스트 파일 경로
  --date <YYYY-MM-DD>    선택. 기본값: 오늘 날짜
  --title <string>       선택. 회의 제목 (없으면 AI 자동 생성)
  --skip-transcription   플래그. 입력 파일을 이미 변환된 텍스트로 처리

dotenv/config import로 .env 로드.
orchestrator의 run() 함수 호출.

사용 예시 주석:
  node src/index.js --input ./meeting.mp3 --date 2025-01-15
  node src/index.js --input ./transcript.txt --skip-transcription
```

---

## Step 7: 전체 테스트

```
아래 샘플 텍스트로 전체 파이프라인을 테스트해줘.

test/sample-transcript.txt 파일을 만들고 아래 내용 넣어:
---
참석자: 김팀장, 이기획, 박디자인

김팀장: 오늘 회의는 2월 캠페인 준비 관련입니다. 이기획님, 현황 공유해주세요.
이기획: 네. 현재 소재 기획안 80% 완성됐고, 1월 말까지 완료 예정입니다.
김팀장: 좋습니다. 예산은 지난번 승인된 500만원으로 확정합니다.
박디자인: 디자인 작업은 이기획님 기획안 받는 즉시 착수하겠습니다. 2월 5일까지 완료 가능합니다.
김팀장: 그러면 결정사항 정리합니다. 예산 500만원 확정, 기획안 1월 31일 마감, 디자인 2월 5일 마감.
이기획: 다음 회의는 2월 3일 오전 10시에 하면 좋겠습니다.
김팀장: 좋습니다. 수고하셨습니다.
---

실행:
node src/index.js --input test/sample-transcript.txt --date 2025-01-15 --skip-transcription

output/ 폴더에 DOCX가 생성되면 성공.
```

---

## 체크리스트

Claude Code 작업 완료 후 확인:

- [ ] `npm install` 에러 없음
- [ ] `.env` 파일에 API 키 입력됨
- [ ] `node src/index.js --input test/sample.txt --skip-transcription` 실행 성공
- [ ] `output/` 폴더에 DOCX 파일 생성됨
- [ ] DOCX 열었을 때 모든 섹션 (요약, 결정사항, 액션아이템 표) 정상 출력
- [ ] 액션아이템 표의 우선순위 셀 색상 표시 정상
