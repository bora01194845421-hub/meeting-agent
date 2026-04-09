// 회의록 에이전트 웹 서버
import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { IncomingForm } from 'formidable';
import { buildMeetingDocument } from './templates/meeting-template.js';
import { run } from './src/orchestrator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PORT = process.env.PORT || 3000;
const HAS_API_KEY = !!process.env.ANTHROPIC_API_KEY;

// ── 데모용 샘플 데이터 ─────────────────────────────────
const DEMO_ANALYZED = {
  meeting_title: '2월 캠페인 준비 회의',
  participants: ['김팀장', '이기획', '박디자인'],
  sections: [
    { title: '기획안 현황 보고', content: '이기획 담당자가 소재 기획안 80% 완성 현황을 공유했으며, 1월 말까지 완료 예정임을 보고했습니다.', duration_estimate: '5분' },
    { title: '예산 확정', content: '김팀장이 지난번 승인된 500만원 예산을 최종 확정했습니다.', duration_estimate: '3분' },
    { title: '디자인 일정 논의', content: '박디자인 담당자가 기획안 수령 즉시 작업에 착수하여 2월 5일까지 완료 가능함을 확인했습니다.', duration_estimate: '5분' },
    { title: '결정사항 정리 및 마무리', content: '예산 500만원 확정, 기획안 1월 31일 마감, 디자인 2월 5일 마감으로 최종 결정했습니다.', duration_estimate: '2분' },
  ],
};
const DEMO_EXTRACTED = {
  project_name: '2025 상반기 마케팅 캠페인',
  venue: '3층 회의실',
  external_participants: [],
  internal_participants: ['김팀장 (마케팅팀)', '이기획 (기획)', '박디자인 (디자인)'],
  summary: '2월 캠페인 준비를 위해 예산 500만원이 확정되었습니다.',
  decisions: ['2월 캠페인 예산 500만원 확정', '소재 기획안 마감: 2025년 1월 31일', '디자인 작업 마감: 2025년 2월 5일'],
  action_items: [
    { task: '소재 기획안 최종 완료 및 박디자인에게 전달', assignee: '이기획', due_date: '2025-01-31', priority: 'high' },
    { task: '캠페인 디자인 작업 완료', assignee: '박디자인', due_date: '2025-02-05', priority: 'high' },
    { task: '2월 3일 다음 회의 일정 공유 및 안건 준비', assignee: '김팀장', due_date: '2025-02-01', priority: 'medium' },
  ],
  next_meeting: '2025년 2월 3일 오전 10시',
};

// jobs: { status, step, fileName, filePath, previewData }
const jobs = new Map();
function jobId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ── HTML 미리보기 렌더러 ──────────────────────────────
function renderPreview(data) {
  const { analyzedData: a, extractedData: e, meetingDate } = data;
  const DAYS = ['일','월','화','수','목','금','토'];
  const d = meetingDate ? new Date(meetingDate) : new Date();
  const dateStr = meetingDate ? `${meetingDate} (${DAYS[d.getDay()]})` : '';

  const projName  = e?.project_name ?? a?.meeting_title ?? '';
  const agenda    = (a?.sections ?? []).map(s => s.title).join(', ');
  const venue     = e?.venue ?? '';
  const extPart   = (e?.external_participants ?? []).join(', ') || '-';
  const intPart   = (e?.internal_participants ?? a?.participants ?? []).join(', ') || '-';

  const sectionRows = (a?.sections ?? []).map(s => `
    <tr><td class="sub-label">${s.title}</td>
        <td>${s.content}${s.duration_estimate ? ` <span class="muted">(약 ${s.duration_estimate})</span>` : ''}</td></tr>
  `).join('');

  const decisions = (e?.decisions ?? []).map((d, i) =>
    `<li>${i+1}. ${d}</li>`).join('');

  const actionRows = (e?.action_items ?? []).map(it => {
    const priClass = it.priority === 'high' ? 'pri-high' : it.priority === 'low' ? 'pri-low' : 'pri-mid';
    const priLabel = it.priority === 'high' ? '높음' : it.priority === 'low' ? '낮음' : '중간';
    return `<tr>
      <td>${it.task}</td>
      <td>${it.assignee ?? '-'}</td>
      <td>${it.due_date ?? '-'}</td>
      <td class="${priClass}">${priLabel}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>회의 결과 보고서 미리보기</title>
  <style>
    body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;max-width:820px;margin:40px auto;padding:0 20px;color:#111;background:#f0f0f0}
    .paper{background:#fff;padding:40px 48px;box-shadow:0 2px 12px rgba(0,0,0,.12);border-radius:4px}
    .actions{text-align:right;margin-bottom:16px}
    .btn{padding:8px 18px;background:#1F3864;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;text-decoration:none;display:inline-block}
    .btn:hover{background:#2E75B6}
    h1{text-align:center;font-size:20px;border-bottom:1.5px solid #000;padding-bottom:12px;margin:0 0 0 0}
    table{width:100%;border-collapse:collapse;margin-top:0}
    td,th{border:1px solid #000;padding:7px 10px;font-size:13px;vertical-align:top}
    .label{background:#f2f2f2;font-weight:bold;width:15%;white-space:nowrap;vertical-align:middle}
    .sub-label{background:#f9f9f9;font-weight:bold;width:20%;font-size:12px;color:#444}
    .section-head{background:#f2f2f2;font-weight:bold;padding:10px;border:1px solid #000}
    .content-area{padding:14px;border:1px solid #000;border-top:none;min-height:300px;line-height:1.8;font-size:13px}
    ul.decs{margin:4px 0 0 16px;padding:0}
    .action-table th{background:#1F3864;color:#fff;text-align:center;font-size:12px}
    .action-table td{font-size:12px;text-align:center}
    .action-table td:nth-child(1){text-align:left}
    .pri-high{color:#C0392B;font-weight:bold}
    .pri-mid{color:#D68910}
    .pri-low{color:#1E8449}
    .muted{color:#888;font-size:11px}
    .section-block{margin-bottom:12px}
    .section-block strong{display:block;margin-bottom:4px}
    @media print{body{background:#fff}.paper{box-shadow:none;padding:20px}.actions{display:none}}
  </style>
</head>
<body>
  <div class="actions">
    <button class="btn" onclick="window.print()">🖨️ 인쇄 / PDF 저장</button>
    <a class="btn" href="javascript:history.back()" style="margin-left:8px">← 돌아가기</a>
  </div>
  <div class="paper">
    <h1>회의 결과 보고서</h1>
    <table>
      <tr>
        <td class="label">연구명</td>
        <td colspan="3">${projName}</td>
      </tr>
      <tr>
        <td class="label">회의안건</td>
        <td colspan="3">${agenda}</td>
      </tr>
      <tr>
        <td class="label">일&nbsp;&nbsp;&nbsp;&nbsp;시</td>
        <td style="width:40%">${dateStr}</td>
        <td class="label" style="text-align:center;width:10%">장소</td>
        <td>${venue}</td>
      </tr>
      <tr>
        <td class="label" rowspan="2" style="vertical-align:middle">참석자</td>
        <td class="sub-label" style="width:12%">외부</td>
        <td colspan="2">${extPart}</td>
      </tr>
      <tr>
        <td class="sub-label">내부</td>
        <td colspan="2">${intPart}</td>
      </tr>
    </table>

    <div class="section-head">회의 내용</div>
    <div class="content-area">
      ${(a?.sections ?? []).length > 0 ? `
        <div class="section-block"><strong>◆ 논의 내용</strong>
          ${(a?.sections ?? []).map(s => `
            <div style="margin-bottom:10px">
              <strong>${s.title}</strong>
              <div style="margin-left:12px">${s.content}</div>
              ${s.duration_estimate ? `<div class="muted" style="margin-left:12px">(약 ${s.duration_estimate})</div>` : ''}
            </div>`).join('')}
        </div>` : ''}

      ${(e?.decisions ?? []).length > 0 ? `
        <div class="section-block"><strong>◆ 결정사항</strong>
          <ul class="decs">${decisions}</ul>
        </div>` : ''}

      ${(e?.action_items ?? []).length > 0 ? `
        <div class="section-block"><strong>◆ 액션아이템</strong>
          <table class="action-table" style="margin-top:6px">
            <tr><th style="width:45%">업무 내용</th><th>담당자</th><th>기한</th><th>우선순위</th></tr>
            ${actionRows}
          </table>
        </div>` : ''}

      ${e?.next_meeting ? `
        <div class="section-block"><strong>◆ 다음 회의</strong>
          <div style="margin-left:12px">${e.next_meeting}</div>
        </div>` : ''}
    </div>
  </div>
</body>
</html>`;
}

const TEXT_EXTS = new Set(['.txt', '.md']);

function makeDocxName(dateStr) {
  const now = new Date();
  const datePart = (dateStr || now.toISOString().slice(0,10)).replace(/-/g,'');
  const timePart = now.toTimeString().slice(0,8).replace(/:/g,'');
  return `회의록_${datePart}_${timePart}.docx`;
}

// ── 필드 파싱 헬퍼 ────────────────────────────────────
function field(fields, key) {
  const v = fields[key];
  return (Array.isArray(v) ? v[0] : v) || '';
}

// ── 업로드 파일 처리 ──────────────────────────────────
async function processUpload(id, filePath, originalName, fields) {
  jobs.set(id, { status: 'processing', step: '처리 시작...' });
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const meetingDate   = field(fields, 'date');
  const projectName   = field(fields, 'project_name');
  const venue         = field(fields, 'venue');
  const extParticipants = field(fields, 'external_participants');
  const intParticipants = field(fields, 'internal_participants');

  try {
    const ext = path.extname(originalName).toLowerCase();
    const skipTranscription = TEXT_EXTS.has(ext);

    if (HAS_API_KEY) {
      jobs.set(id, { status: 'processing', step: skipTranscription ? '텍스트 로드 중...' : 'Whisper 변환 중...' });
      const { outputPath, analyzedData, extractedData } = await run({
        inputFile: filePath,
        meetingDate: meetingDate || new Date().toISOString().slice(0,10),
        skipTranscription,
        manualFields: {
          project_name: projectName || undefined,
          venue: venue || undefined,
          external_participants: extParticipants ? extParticipants.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          internal_participants: intParticipants ? intParticipants.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        },
      });
      jobs.set(id, {
        status: 'done',
        fileName: path.basename(outputPath),
        filePath: outputPath,
        previewData: { analyzedData, extractedData, meetingDate: meetingDate || new Date().toISOString().slice(0,10) },
      });
    } else {
      jobs.set(id, { status: 'processing', step: '데모 DOCX 생성 중...' });
      let rawTranscript = '';
      if (TEXT_EXTS.has(ext)) {
        rawTranscript = fs.readFileSync(filePath, 'utf-8');
      } else {
        rawTranscript = `[오디오 파일: ${originalName}]\n(API 키 없이는 변환 불가 — 데모 데이터로 대체합니다)`;
      }

      // 수동 입력값으로 데모 데이터 덮어쓰기
      const extracted = { ...DEMO_EXTRACTED };
      if (projectName)    extracted.project_name = projectName;
      if (venue)          extracted.venue = venue;
      if (extParticipants) extracted.external_participants = extParticipants.split(',').map(s => s.trim()).filter(Boolean);
      if (intParticipants) extracted.internal_participants = intParticipants.split(',').map(s => s.trim()).filter(Boolean);

      const fileName = makeDocxName(meetingDate);
      const outPath  = path.join(OUTPUT_DIR, fileName);
      const buffer   = await buildMeetingDocument({
        analyzedData: DEMO_ANALYZED,
        extractedData: extracted,
        meetingDate: meetingDate || '2025-01-15',
        rawTranscript,
      });
      fs.writeFileSync(outPath, buffer);
      jobs.set(id, {
        status: 'done',
        fileName,
        filePath: outPath,
        previewData: { analyzedData: DEMO_ANALYZED, extractedData: extracted, meetingDate: meetingDate || '2025-01-15' },
      });
    }
  } catch (err) {
    jobs.set(id, { status: 'error', message: err.message });
  } finally {
    try { fs.unlinkSync(filePath); } catch {}
  }
}

// ── 텍스트 직접 처리 (실시간 녹음 탭용) ──────────────
async function processText(id, text, fields) {
  jobs.set(id, { status: 'processing', step: '텍스트 분석 중...' });
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const meetingDate   = field(fields, 'date');
  const projectName   = field(fields, 'project_name');
  const venue         = field(fields, 'venue');
  const extParticipants = field(fields, 'external_participants');
  const intParticipants = field(fields, 'internal_participants');

  try {
    if (HAS_API_KEY) {
      const { outputPath, analyzedData, extractedData } = await run({
        inputFile: null,
        meetingDate: meetingDate || new Date().toISOString().slice(0,10),
        skipTranscription: true,
        _rawText: text,
        manualFields: {
          project_name: projectName || undefined,
          venue: venue || undefined,
          external_participants: extParticipants ? extParticipants.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          internal_participants: intParticipants ? intParticipants.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        },
      });
      jobs.set(id, {
        status: 'done',
        fileName: path.basename(outputPath),
        filePath: outputPath,
        previewData: { analyzedData, extractedData, meetingDate: meetingDate || new Date().toISOString().slice(0,10) },
      });
    } else {
      const extracted = { ...DEMO_EXTRACTED };
      if (projectName)     extracted.project_name = projectName;
      if (venue)           extracted.venue = venue;
      if (extParticipants) extracted.external_participants = extParticipants.split(',').map(s => s.trim()).filter(Boolean);
      if (intParticipants) extracted.internal_participants = intParticipants.split(',').map(s => s.trim()).filter(Boolean);
      const fileName = makeDocxName(meetingDate);
      const outPath  = path.join(OUTPUT_DIR, fileName);
      const buffer   = await buildMeetingDocument({ analyzedData: DEMO_ANALYZED, extractedData: extracted, meetingDate: meetingDate || new Date().toISOString().slice(0,10), rawTranscript: text });
      fs.writeFileSync(outPath, buffer);
      jobs.set(id, { status: 'done', fileName, filePath: outPath, previewData: { analyzedData: DEMO_ANALYZED, extractedData: extracted, meetingDate: meetingDate || new Date().toISOString().slice(0,10) } });
    }
  } catch (err) {
    jobs.set(id, { status: 'error', message: err.message });
  }
}

// ── HTML 페이지 ───────────────────────────────────────
function renderPage() {
  const files = fs.existsSync(OUTPUT_DIR)
    ? fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.docx')).reverse().slice(0, 10)
    : [];
  const fileList = files.map(f =>
    `<li><a href="/download/${encodeURIComponent(f)}">📄 ${f}</a></li>`
  ).join('') || '<li style="color:#999">생성된 파일 없음</li>';

  const modeLabel = HAS_API_KEY
    ? `<span class="badge ai">🤖 AI 분석 모드</span>`
    : `<span class="badge demo">🎬 데모 모드 (API 키 없음)</span>`;

  const today = new Date().toISOString().slice(0,10);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>회의록 에이전트</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;max-width:780px;margin:50px auto;padding:0 24px;color:#333;background:#fafafa}
    h1{color:#1F3864;border-bottom:3px solid #2E75B6;padding-bottom:10px;margin-bottom:6px}
    .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:bold;margin-bottom:16px}
    .badge.ai{background:#e8f4e8;color:#1a7a1a}
    .badge.demo{background:#fff3e0;color:#b45309}
    /* 탭 */
    .tabs{display:flex;gap:0;margin-bottom:0;border-bottom:2px solid #2E75B6}
    .tab-btn{padding:10px 24px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:600;color:#888;border-bottom:3px solid transparent;margin-bottom:-2px}
    .tab-btn.active{color:#1F3864;border-bottom:3px solid #1F3864}
    .tab-panel{display:none;padding-top:20px}
    .tab-panel.active{display:block}
    /* 공통 폼 요소 */
    .upload-box{background:#fff;border:2px dashed #2E75B6;border-radius:10px;padding:28px;text-align:center;transition:border-color .2s}
    .upload-box:hover{border-color:#1F3864;background:#F0F4FF}
    .upload-box input[type=file]{display:none}
    .upload-box label{cursor:pointer;font-size:15px;color:#2E75B6;font-weight:bold}
    .hint{font-size:12px;color:#999;margin-top:8px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
    .field{display:flex;flex-direction:column;gap:4px}
    .field label{font-size:12px;color:#555;font-weight:600}
    .field input,.field textarea{padding:8px 10px;border:1px solid #ccc;border-radius:6px;font-size:13px;font-family:inherit}
    .field textarea{resize:vertical;min-height:52px}
    .field .sub{font-size:11px;color:#aaa;margin-top:2px}
    .form-bottom{display:flex;gap:12px;margin-top:14px;align-items:flex-end;flex-wrap:wrap}
    .form-bottom input[type=date]{padding:8px 12px;border:1px solid #ccc;border-radius:6px;font-size:14px}
    .btn{padding:10px 28px;background:#2E75B6;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:bold;cursor:pointer}
    .btn:hover{background:#1F3864}
    .btn:disabled{background:#aaa;cursor:not-allowed}
    #file-name{font-size:13px;color:#555;margin-top:8px;min-height:18px}
    /* 상태박스 */
    .status-box{margin-top:20px;padding:14px 18px;border-radius:8px;background:#F0F4FF;border-left:4px solid #2E75B6;display:none;font-size:14px}
    ul{list-style:none;padding:0;margin-top:8px}
    li{padding:10px 14px;margin:5px 0;background:#fff;border-radius:6px;border:1px solid #e8eaf0}
    a{color:#2E75B6;text-decoration:none;font-weight:bold}
    a:hover{text-decoration:underline}
    h2{color:#1F3864;margin-top:32px;font-size:16px}
    /* 실시간 녹음 */
    .rec-area{background:#fff;border:1px solid #dde;border-radius:10px;padding:20px}
    .rec-controls{display:flex;gap:12px;align-items:center;margin-bottom:14px}
    .rec-btn{width:52px;height:52px;border-radius:50%;border:none;font-size:22px;cursor:pointer;transition:all .2s}
    .rec-btn.idle{background:#2E75B6;color:#fff}
    .rec-btn.idle:hover{background:#1F3864}
    .rec-btn.recording{background:#e74c3c;color:#fff;animation:pulse 1.2s infinite}
    @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(231,76,60,.4)}50%{box-shadow:0 0 0 10px rgba(231,76,60,0)}}
    .rec-status{font-size:13px;color:#666}
    .rec-status.on{color:#e74c3c;font-weight:bold}
    #transcript-box{width:100%;min-height:160px;padding:12px;border:1px solid #ccc;border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;line-height:1.7}
    #interim-text{color:#aaa;font-style:italic;font-size:13px;margin-top:6px;min-height:20px}
    .char-count{font-size:11px;color:#aaa;text-align:right;margin-top:3px}
  </style>
</head>
<body>
  <h1>🤖 회의록 에이전트</h1>
  ${modeLabel}

  <div class="tabs">
    <button class="tab-btn active" onclick="switchTab('upload')">📁 파일 업로드</button>
    <button class="tab-btn" onclick="switchTab('realtime')">🎙️ 실시간 녹음</button>
  </div>

  <!-- ── 탭 1: 파일 업로드 ── -->
  <div class="tab-panel active" id="tab-upload">
    <form id="upload-form" enctype="multipart/form-data">
      <div class="upload-box" id="drop-zone">
        <label for="file-input">📁 클릭하거나 파일을 여기에 드래그하세요</label>
        <input type="file" id="file-input" name="file" accept=".txt,.md,.mp3,.mp4,.wav,.m4a,.webm">
        <div class="hint">지원 형식: TXT, MD (텍스트) · MP3, MP4, WAV, M4A, WEBM (오디오)</div>
        <div id="file-name"></div>
      </div>
      <div class="grid">
        <div class="field"><label>연구명 / 프로젝트명</label><input type="text" name="project_name" placeholder="AI가 자동 추출 (선택 입력)"></div>
        <div class="field"><label>장소</label><input type="text" name="venue" placeholder="예: 3층 대회의실"></div>
        <div class="field">
          <label>외부 참석자</label>
          <textarea name="external_participants" placeholder="쉼표로 구분&#10;예: 홍길동 (ABC사), 김영희 (XYZ연구소)"></textarea>
          <span class="sub">쉼표(,)로 구분</span>
        </div>
        <div class="field">
          <label>내부 참석자</label>
          <textarea name="internal_participants" placeholder="쉼표로 구분&#10;예: 이팀장 (개발팀), 박사원 (기획)"></textarea>
          <span class="sub">쉼표(,)로 구분 · AI가 자동 추출 가능</span>
        </div>
      </div>
      <div class="form-bottom">
        <div><label style="font-size:12px;color:#555;display:block;margin-bottom:4px;font-weight:600">회의 날짜</label>
          <input type="date" name="date" value="${today}"></div>
        <button type="submit" class="btn">회의록 생성</button>
      </div>
    </form>
    <div class="status-box" id="status-upload"></div>
  </div>

  <!-- ── 탭 2: 실시간 녹음 ── -->
  <div class="tab-panel" id="tab-realtime">
    <div class="rec-area">
      <div class="rec-controls">
        <button class="rec-btn idle" id="rec-btn" title="녹음 시작">🎙️</button>
        <div>
          <div id="rec-status" class="rec-status">마이크 버튼을 눌러 녹음을 시작하세요</div>
          <div style="font-size:11px;color:#aaa;margin-top:2px">Chrome 브라우저 권장 · 한국어 자동 인식</div>
        </div>
      </div>
      <textarea id="transcript-box" placeholder="녹음을 시작하면 30초마다 자동으로 전사됩니다.&#10;녹음 후 내용을 직접 수정할 수도 있습니다."></textarea>
      <div id="interim-text"></div>
      <div class="char-count" style="display:flex;justify-content:space-between;align-items:center">
        <span><span id="char-count">0</span>자</span>
        <button onclick="downloadTranscript()" style="font-size:12px;padding:3px 10px;background:#f0f4ff;border:1px solid #2E75B6;border-radius:4px;color:#2E75B6;cursor:pointer">📄 전사본 다운로드</button>
      </div>
    </div>

    <div class="grid" style="margin-top:14px">
      <div class="field"><label>연구명 / 프로젝트명</label><input type="text" id="r-project" placeholder="AI가 자동 추출 (선택 입력)"></div>
      <div class="field"><label>장소</label><input type="text" id="r-venue" placeholder="예: 3층 대회의실"></div>
      <div class="field">
        <label>외부 참석자</label>
        <textarea id="r-ext" placeholder="쉼표로 구분&#10;예: 홍길동 (ABC사), 김영희 (XYZ연구소)"></textarea>
        <span class="sub">쉼표(,)로 구분</span>
      </div>
      <div class="field">
        <label>내부 참석자</label>
        <textarea id="r-int" placeholder="쉼표로 구분&#10;예: 이팀장 (개발팀), 박사원 (기획)"></textarea>
        <span class="sub">쉼표(,)로 구분 · AI가 자동 추출 가능</span>
      </div>
    </div>
    <div class="form-bottom">
      <div><label style="font-size:12px;color:#555;display:block;margin-bottom:4px;font-weight:600">회의 날짜</label>
        <input type="date" id="r-date" value="${today}"></div>
      <button class="btn" id="gen-btn" onclick="generateFromText()">회의록 생성</button>
    </div>
    <div class="status-box" id="status-realtime"></div>
  </div>

  <h2>생성된 파일 목록</h2>
  <ul id="file-list">${fileList}</ul>

  <script>
    // ── 탭 전환 ──
    function switchTab(name) {
      document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', ['upload','realtime'][i] === name));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('tab-' + name).classList.add('active');
    }

    // ── 공통: 폴링 + 완료 처리 ──
    const fileListEl = document.getElementById('file-list');
    function pollJob(id, statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.borderColor = '#2E75B6';
      const poll = setInterval(async () => {
        const r = await fetch('/status/' + id);
        const job = await r.json();
        if (job.status === 'processing') {
          statusEl.innerHTML = '⏳ ' + (job.step || '처리 중...');
        } else if (job.status === 'done') {
          clearInterval(poll);
          statusEl.style.borderColor = '#1a7a1a';
          statusEl.innerHTML = '✅ 완료! <a href="/download/' + encodeURIComponent(job.fileName) + '">📥 ' + job.fileName + ' 다운로드</a>'
            + '&nbsp;&nbsp;<a href="/preview/' + id + '" target="_blank" style="background:#1F3864;color:#fff;padding:4px 12px;border-radius:4px;font-size:13px">👁 미리보기</a>';
          const lr = await fetch('/files');
          const { files } = await lr.json();
          fileListEl.innerHTML = files.map(f => '<li><a href="/download/' + encodeURIComponent(f) + '">📄 ' + f + '</a></li>').join('') || '<li style="color:#999">생성된 파일 없음</li>';
          document.getElementById('gen-btn') && (document.getElementById('gen-btn').disabled = false);
        } else if (job.status === 'error') {
          clearInterval(poll);
          statusEl.style.borderColor = '#c0392b';
          statusEl.innerHTML = '❌ 오류: ' + job.message;
          document.getElementById('gen-btn') && (document.getElementById('gen-btn').disabled = false);
        }
      }, 1000);
    }

    // ── 탭1: 파일 업로드 ──
    const fileInput  = document.getElementById('file-input');
    const fileNameEl = document.getElementById('file-name');
    const dropZone   = document.getElementById('drop-zone');
    fileInput.addEventListener('change', () => { fileNameEl.textContent = fileInput.files[0]?.name || ''; });
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.background='#e8f0ff'; });
    dropZone.addEventListener('dragleave', () => { dropZone.style.background=''; });
    dropZone.addEventListener('drop', e => {
      e.preventDefault(); dropZone.style.background='';
      if (e.dataTransfer.files[0]) { fileInput.files = e.dataTransfer.files; fileNameEl.textContent = fileInput.files[0].name; }
    });
    document.getElementById('upload-form').addEventListener('submit', async e => {
      e.preventDefault();
      if (!fileInput.files[0]) { alert('파일을 선택해주세요.'); return; }
      const statusEl = document.getElementById('status-upload');
      statusEl.style.display = 'block'; statusEl.style.borderColor = '#2E75B6'; statusEl.innerHTML = '⏳ 업로드 중...';
      const res = await fetch('/upload', { method: 'POST', body: new FormData(e.target) });
      const { id, error } = await res.json();
      if (error) { statusEl.style.borderColor='#c0392b'; statusEl.innerHTML='❌ ' + error; return; }
      pollJob(id, statusEl);
    });

    // ── 탭2: 실시간 녹음 (MediaRecorder + OpenAI Whisper) ──
    const transcriptBox = document.getElementById('transcript-box');
    const interimEl     = document.getElementById('interim-text');
    const recBtn        = document.getElementById('rec-btn');
    const recStatus     = document.getElementById('rec-status');
    const charCount     = document.getElementById('char-count');
    let mediaRecorder = null;
    let audioChunks   = [];
    let isRecording   = false;
    let chunkTimer    = null;
    let elapsedTimer  = null;
    let elapsedSec    = 0;

    transcriptBox.addEventListener('input', () => { charCount.textContent = transcriptBox.value.length; });
    recBtn.addEventListener('click', () => { if (!isRecording) startRecording(); else stopRecording(); });

    function fmtTime(s) { return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'); }

    async function startRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        mediaRecorder = new MediaRecorder(stream, { mimeType });
        audioChunks = [];
        isRecording = true;
        elapsedSec = 0;

        recBtn.className = 'rec-btn recording';
        recBtn.textContent = '⏹';
        recStatus.className = 'rec-status on';
        recStatus.textContent = '🔴 녹음 중... 00:00';

        elapsedTimer = setInterval(() => {
          elapsedSec++;
          if (isRecording) recStatus.textContent = '🔴 녹음 중... ' + fmtTime(elapsedSec);
        }, 1000);

        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
        mediaRecorder.start(1000);

        // 30초마다 자동 전사
        chunkTimer = setInterval(() => sendChunk(false), 30000);
      } catch(err) {
        recStatus.textContent = '⚠️ 마이크 접근 실패: ' + err.message;
      }
    }

    async function stopRecording() {
      isRecording = false;
      clearInterval(chunkTimer);
      clearInterval(elapsedTimer);
      if (mediaRecorder) {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
        mediaRecorder = null;
      }
      recBtn.className = 'rec-btn idle';
      recBtn.textContent = '🎙️';
      recStatus.className = 'rec-status on';
      recStatus.textContent = '💬 마지막 구간 전사 중...';
      await sendChunk(true);
      recStatus.className = 'rec-status';
      recStatus.textContent = '✅ 녹음 완료. 내용을 확인 후 회의록을 생성하세요.';
      interimEl.textContent = '';
    }

    async function sendChunk(isFinal) {
      if (audioChunks.length === 0) return;
      const chunks = [...audioChunks];
      audioChunks = [];
      const mimeType = chunks[0].type || 'audio/webm';
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size < 1000) return; // 너무 짧으면 무시

      if (!isFinal) interimEl.textContent = '💬 전사 중...';
      const form = new FormData();
      form.append('audio', blob, 'chunk.' + ext);
      try {
        const r = await fetch('/transcribe-chunk', { method: 'POST', body: form });
        const { text, error } = await r.json();
        if (text && text.trim()) {
          transcriptBox.value += (transcriptBox.value ? ' ' : '') + text.trim();
          charCount.textContent = transcriptBox.value.length;
        }
        if (error) interimEl.textContent = '⚠️ ' + error;
        else if (!isFinal) interimEl.textContent = '';
      } catch(e) {
        interimEl.textContent = '⚠️ 전사 오류: ' + e.message;
      }
    }

    function downloadTranscript() {
      const text = transcriptBox.value.trim();
      if (!text) { alert('전사된 내용이 없습니다.'); return; }
      const date = new Date().toISOString().slice(0,10).replace(/-/g,'');
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '전사본_' + date + '.txt';
      a.click();
    }

    async function generateFromText() {
      const text = transcriptBox.value.trim();
      if (!text) { alert('녹음된 텍스트가 없습니다.'); return; }
      const statusEl = document.getElementById('status-realtime');
      document.getElementById('gen-btn').disabled = true;
      statusEl.style.display = 'block'; statusEl.style.borderColor = '#2E75B6'; statusEl.innerHTML = '⏳ 분석 중...';
      const res = await fetch('/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          date: document.getElementById('r-date').value,
          project_name: document.getElementById('r-project').value,
          venue: document.getElementById('r-venue').value,
          external_participants: document.getElementById('r-ext').value,
          internal_participants: document.getElementById('r-int').value,
        }),
      });
      const { id, error } = await res.json();
      if (error) { statusEl.style.borderColor='#c0392b'; statusEl.innerHTML='❌ ' + error; document.getElementById('gen-btn').disabled=false; return; }
      pollJob(id, statusEl);
    }
  </script>
</body>
</html>`;
}

// ── 라우터 ────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(renderPage());
  }

  if (req.method === 'POST' && url.pathname === '/upload') {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

    const form = new IncomingForm({
      uploadDir: UPLOAD_DIR,
      keepExtensions: true,
      maxFileSize: 200 * 1024 * 1024,
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }

      const uploaded = Array.isArray(files.file) ? files.file[0] : files.file;
      if (!uploaded) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: '파일 없음' }));
      }

      const originalName = uploaded.originalFilename || uploaded.name || 'upload.txt';
      const filePath = uploaded.filepath || uploaded.path;
      const id = jobId();
      jobs.set(id, { status: 'processing', step: '업로드 완료, 처리 준비 중...' });

      processUpload(id, filePath, originalName, fields).catch(() => {});

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id }));
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/generate') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { text, date, project_name, venue, external_participants, internal_participants } = JSON.parse(body);
        if (!text) { res.writeHead(400, {'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'텍스트 없음'})); }
        const id = jobId();
        jobs.set(id, { status: 'processing', step: '텍스트 분석 준비 중...' });
        processText(id, text, { date: [date], project_name: [project_name], venue: [venue], external_participants: [external_participants], internal_participants: [internal_participants] }).catch(() => {});
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ id }));
      } catch(e) {
        res.writeHead(400, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 실시간 녹음 청크 전사
  if (req.method === 'POST' && url.pathname === '/transcribe-chunk') {
    if (!process.env.OPENAI_API_KEY) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'OPENAI_API_KEY가 설정되지 않았습니다.' }));
    }
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const form = new IncomingForm({ uploadDir: UPLOAD_DIR, keepExtensions: true, maxFileSize: 25 * 1024 * 1024 });
    form.parse(req, async (err, fields, files) => {
      if (err) { res.writeHead(400, {'Content-Type':'application/json'}); return res.end(JSON.stringify({ error: err.message })); }
      const uploaded = Array.isArray(files.audio) ? files.audio[0] : files.audio;
      if (!uploaded) { res.writeHead(400, {'Content-Type':'application/json'}); return res.end(JSON.stringify({ error: '오디오 없음' })); }
      const filePath = uploaded.filepath || uploaded.path;
      try {
        const { default: OpenAI } = await import('openai');
        const { toFile } = await import('openai');
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const origName = uploaded.originalFilename || 'chunk.webm';
        const fileStream = fs.createReadStream(filePath);
        const file = await toFile(fileStream, origName);
        const response = await openai.audio.transcriptions.create({ model: 'whisper-1', file, language: 'ko' });
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ text: response.text }));
      } catch(e) {
        res.writeHead(500, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ error: e.message }));
      } finally {
        try { fs.unlinkSync(filePath); } catch {}
      }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/status/')) {
    const id = url.pathname.split('/')[2];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(jobs.get(id) || { status: 'unknown' }));
  }

  if (req.method === 'GET' && url.pathname === '/files') {
    const files = fs.existsSync(OUTPUT_DIR)
      ? fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.docx')).reverse().slice(0, 10)
      : [];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ files }));
  }

  if (req.method === 'GET' && url.pathname.startsWith('/preview/')) {
    const id = url.pathname.split('/')[2];
    const job = jobs.get(id);
    if (!job?.previewData) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(renderPreview(job.previewData));
  }

  if (req.method === 'GET' && url.pathname.startsWith('/download/')) {
    const fileName = decodeURIComponent(url.pathname.slice('/download/'.length));
    const filePath = path.join(OUTPUT_DIR, path.basename(fileName));
    if (!fs.existsSync(filePath)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    });
    return res.end(fs.readFileSync(filePath));
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`🌐 서버 시작: http://localhost:${PORT}`);
  console.log(HAS_API_KEY ? '🤖 AI 분석 모드' : '🎬 데모 모드');
});
