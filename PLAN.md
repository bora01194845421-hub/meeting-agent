# 회의록 자동 생성 에이전트 — 프로젝트 계획서

## 개요

녹취 파일(오디오/텍스트)을 업로드하면 정해진 템플릿에 맞춰 회의록 DOCX를 자동 생성하는 멀티 서브에이전트 시스템.

---

## 기술 스택

| 항목 | 선택 |
|------|------|
| 런타임 | Node.js (Claude Code 환경) |
| AI | Anthropic API (`claude-sonnet-4-5`) |
| 음성→텍스트 | OpenAI Whisper API |
| 문서 생성 | `docx` npm 패키지 |
| 파일 입출력 | Node.js `fs`, `path` |
| CLI | `commander` npm 패키지 |

---

## 디렉토리 구조

```
meeting-agent/
├── PLAN.md                  ← 이 파일
├── AGENTS.md                ← 서브에이전트 명세
├── TEMPLATE.md              ← 회의록 템플릿 명세
├── package.json
├── src/
│   ├── index.js             ← CLI 진입점
│   ├── orchestrator.js      ← 오케스트레이터 에이전트
│   └── agents/
│       ├── transcriber.js   ← Sub-Agent 1: 음성→텍스트
│       ├── analyzer.js      ← Sub-Agent 2: 내용 분석·구조화
│       ├── extractor.js     ← Sub-Agent 3: 핵심 정보 추출
│       └── docWriter.js     ← Sub-Agent 4: DOCX 문서 생성
├── templates/
│   └── meeting-template.js  ← DOCX 템플릿 정의
├── prompts/
│   ├── analyze.txt          ← Sub-Agent 2 시스템 프롬프트
│   └── extract.txt          ← Sub-Agent 3 시스템 프롬프트
└── output/                  ← 생성된 회의록 저장 폴더
```

---

## 워크플로우 (단계별)

```
[1] 사용자 입력
    └─ CLI: node src/index.js --input ./recording.mp3 --date 2025-01-15

[2] 오케스트레이터 (orchestrator.js)
    └─ 입력 파일 타입 판별 (오디오 / 텍스트 스크립트)
    └─ 서브에이전트 순차 호출 및 결과 전달

[3] Sub-Agent 1: 트랜스크라이버 (transcriber.js)
    └─ 오디오 파일 → Whisper API → 원문 텍스트 + 화자 구분
    └─ (텍스트 파일 입력 시 이 단계 스킵)

[4] Sub-Agent 2: 분석기 (analyzer.js)
    └─ 원문 텍스트 → Claude API
    └─ 주제별 섹션 분류, 대화 흐름 파악, 구조화된 JSON 반환

[5] Sub-Agent 3: 추출기 (extractor.js)
    └─ 구조화 JSON → Claude API
    └─ 결정사항, 액션아이템, 참석자, 핵심 요약 추출

[6] Sub-Agent 4: 문서 작성기 (docWriter.js)
    └─ 추출 결과 → docx 패키지 → DOCX 파일 생성
    └─ 템플릿 스타일(헤더/푸터/표/목차) 적용

[7] 최종 출력
    └─ output/회의록_YYYYMMDD.docx 저장
    └─ CLI에 요약 결과 출력
```

---

## 핵심 설계 원칙

1. **순차 파이프라인**: 각 서브에이전트는 이전 에이전트의 출력을 입력으로 받음
2. **JSON 계약**: 에이전트 간 데이터는 엄격한 JSON 스키마로 교환
3. **에러 격리**: 각 에이전트가 독립적으로 에러를 처리하고 오케스트레이터에 보고
4. **재실행 가능**: `--skip-transcription` 플래그로 이미 변환된 텍스트 재사용 가능

---

## 환경 변수 (.env)

```
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here   # Whisper용
```
