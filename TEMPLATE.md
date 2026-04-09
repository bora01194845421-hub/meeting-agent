# 회의록 템플릿 명세 (TEMPLATE.md)

`templates/meeting-template.js`에서 `docx` 패키지로 구현할 문서 구조를 정의합니다.

---

## 문서 전체 구조 (위에서 아래 순서)

```
[헤더]
[제목 블록]
[기본 정보 표]
[참석자]
[구분선]
[회의 요약]
[안건별 논의 내용]
[결정사항]
[액션아이템 표]
[다음 회의 일정]
[구분선]
[원문 첨부] (접기 가능 — 회색 박스)
[푸터]
```

---

## 섹션별 세부 명세

### 헤더

```
좌측: 회사/팀 로고 텍스트 (ex. "ACME Corp")
우측: 페이지 번호 ("1 / 2")
하단 구분선: 0.5pt, 색상 #2E75B6
```

### 제목 블록

```
텍스트: meeting_title (Sub-Agent 2 추출)
폰트: 맑은 고딕, 22pt, Bold
색상: #1F3864
정렬: 가운데
상단 여백: 12pt, 하단 여백: 6pt
```

### 기본 정보 표

2열 표 (라벨 | 값), 테두리 없음, 배경 없음

| 라벨 | 값 |
|------|-----|
| 회의 일시 | meetingDate + 요일 |
| 작성일 | 오늘 날짜 (자동) |
| 작성자 | "AI 자동 생성" |
| 회의 장소 | "-" (기본값, 추후 CLI 인자로 추가 가능) |

```
라벨 셀: 폰트 Bold, 색상 #555, 너비 25%
값 셀: 일반, 너비 75%
행 높이: 22pt
```

### 참석자

```
제목: "■ 참석자"  (Heading2 스타일)
내용: participants 배열을 쉼표로 연결
폰트: 10pt, 색상 #333
```

### 구분선

```
Paragraph border-bottom: 1pt, #2E75B6
```

### 회의 요약

```
제목: "■ 회의 요약"  (Heading2)
내용: summary (Sub-Agent 3 추출)
박스 스타일:
  - 배경색: #F0F4FF
  - 좌측 테두리: 4pt solid #2E75B6
  - 패딩: 8pt
폰트: 10pt, 이탤릭
```

### 안건별 논의 내용

```
제목: "■ 안건별 논의 내용"  (Heading2)
sections 배열을 순서대로 반복:
  - 소제목: section.title  (Heading3, 11pt, Bold, 색상 #2E75B6)
  - 내용: section.content  (본문, 10pt)
  - 예상 소요 시간: "(약 {duration_estimate})"  (회색, 9pt)
  섹션 사이 간격: 6pt
```

### 결정사항

```
제목: "■ 결정사항"  (Heading2)
decisions 배열을 번호 목록으로:
  1. 결정사항 텍스트
  2. ...
폰트: 10pt
번호: LevelFormat.DECIMAL
```

### 액션아이템 표

```
제목: "■ 액션아이템"  (Heading2)
```

4열 표:

| No | 업무 내용 | 담당자 | 기한 | 우선순위 |
|-----|----------|--------|------|---------|

```
헤더 행:
  - 배경: #1F3864
  - 텍스트: 흰색, Bold, 9pt
  - 정렬: 가운데

데이터 행:
  - 홀수행 배경: #FFFFFF
  - 짝수행 배경: #F5F7FA
  - 폰트: 9pt
  - 기한 열: Bold

우선순위 셀 색상:
  - "high"   → 배경 #FFF0F0, 텍스트 #C0392B, "높음"
  - "medium" → 배경 #FFFBF0, 텍스트 #D68910, "중간"
  - "low"    → 배경 #F0FFF4, 텍스트 #1E8449, "낮음"

열 너비 비율 (전체 A4 본문 너비 9026 DXA 기준):
  No     : 600
  업무내용: 4000
  담당자  : 1500
  기한    : 1500
  우선순위: 1426
```

### 다음 회의 일정

```
제목: "■ 다음 회의"  (Heading2)
내용: next_meeting (없으면 "미정")
폰트: 10pt
```

### 원문 첨부

```
제목: "■ 회의 원문 (참고용)"  (Heading2, 색상 #888)
내용: rawTranscript 전체
박스 스타일:
  - 배경: #F8F8F8
  - 테두리: 0.5pt, #CCCCCC
폰트: 8pt, 색상 #666, Courier New (고정폭)
최대 줄 수: 제한 없음 (페이지 자동 확장)
```

### 푸터

```
좌측: "본 문서는 AI가 자동 생성한 회의록입니다. 내용을 검토 후 활용하세요."
우측: 생성 일시 (YYYY-MM-DD HH:MM)
폰트: 8pt, 색상 #999
상단 구분선: 0.5pt, #CCCCCC
```

---

## docx 패키지 핵심 설정값

```js
// 문서 기본 설정
const PAGE = {
  size: { width: 11906, height: 16838 }, // A4 (DXA)
  margin: { top: 1418, right: 1134, bottom: 1418, left: 1134 } // 25mm
};

// 표 전체 너비
const TABLE_WIDTH = 9026; // DXA (A4 본문 너비)

// 자주 쓰는 색상 상수
const COLORS = {
  primary: '1F3864',
  accent:  '2E75B6',
  heading: '1F3864',
  bodyText:'333333',
  muted:   '888888',
  tableBg: 'F5F7FA',
  summaryBg: 'F0F4FF',
};
```

---

## 사용 예시 (templates/meeting-template.js export)

```js
// templates/meeting-template.js
const { buildMeetingDocument } = require('./meeting-template');

const buffer = await buildMeetingDocument({
  analyzedData,   // Sub-Agent 2 결과
  extractedData,  // Sub-Agent 3 결과
  meetingDate: '2025-01-15',
  rawTranscript: '...'
});

fs.writeFileSync('output/회의록_20250115.docx', buffer);
```
