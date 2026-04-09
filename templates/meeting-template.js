/**
 * 회의 결과 보고서 템플릿
 * 원본 양식: 회의결과보고서.docx 기반 재현
 */
import {
  Document, Packer, Paragraph, TextRun,
  Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle,
  ShadingType, VerticalAlign,
} from 'docx';

// ── 페이지 / 테이블 치수 (DXA) ────────────────────────
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = { top: 1701, right: 1134, bottom: 1417, left: 1134 };
const TBL_W  = 9491;

// 6열 너비 (합계 = TBL_W)
const COL = { c1: 1403, c2: 1353, c3: 1361, c4: 1361, c5: 1084, c6: 2930 };

// 편의 조합
const W_VALUE5 = COL.c2 + COL.c3 + COL.c4 + COL.c5 + COL.c6; // 8089
const W_DATE   = COL.c2 + COL.c3 + COL.c4;                    // 4074
const W_VENUE  = COL.c6;                                       // 2930
const W_PART   = COL.c3 + COL.c4 + COL.c5 + COL.c6;           // 6736

// ── 색상 ─────────────────────────────────────────────
const LABEL_BG = 'f2f2f2';
const BLACK    = '000000';

// ── 폰트 ─────────────────────────────────────────────
const FONT = 'KoPub돋움체 Medium';

// ── 테두리 헬퍼 ───────────────────────────────────────
const B    = (sz = 3) => ({ style: BorderStyle.SINGLE, color: BLACK, size: sz });
const NONE = { style: BorderStyle.NONE, color: BLACK, size: 2 };

const labelBorders = () => ({ top: B(), bottom: B(), left: NONE, right: B() });
const innerBorders = (noRight = false) => ({
  top: B(), bottom: B(), left: B(), right: noRight ? NONE : B(),
});
const cellMar = { top: 113, bottom: 113, left: 113, right: 113 };

// ── 라벨 셀 ──────────────────────────────────────────
function labelCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: labelBorders(),
    shading: { fill: LABEL_BG, type: ShadingType.CLEAR, color: LABEL_BG },
    margins: cellMar,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      alignment: AlignmentType.DISTRIBUTE,
      children: [new TextRun({ text, font: { name: FONT }, bold: true, size: 22 })],
    })],
  });
}

// ── 값 셀 ────────────────────────────────────────────
function valueCell(children, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: innerBorders(opts.noRight),
    margins: cellMar,
    verticalAlign: opts.valign ?? VerticalAlign.CENTER,
    columnSpan: opts.span,
    children: Array.isArray(children) ? children : [children],
  });
}

function textPara(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align,
    indent: opts.indent,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 60 },
    children: [new TextRun({
      text: text ?? '',
      font: { name: FONT },
      size: opts.size ?? 22,
      bold: opts.bold,
      color: opts.color,
    })],
  });
}

// ── 회의 내용 셀 구성 ─────────────────────────────────
function buildContent(analyzedData, extractedData) {
  const paras    = [];
  const sections = analyzedData?.sections     ?? [];
  const decs     = extractedData?.decisions   ?? [];
  const items    = extractedData?.action_items ?? [];
  const next     = extractedData?.next_meeting;

  const heading = (txt) => textPara(`◆ ${txt}`, { bold: true, before: 120 });

  if (sections.length > 0) {
    paras.push(heading('논의 내용'));
    for (const s of sections) {
      paras.push(textPara(s.title, { bold: true, before: 80 }));
      paras.push(textPara(s.content, { indent: { left: 280 } }));
      if (s.duration_estimate)
        paras.push(textPara(`(약 ${s.duration_estimate})`, { size: 20, color: '888888', indent: { left: 280 } }));
    }
  }

  if (decs.length > 0) {
    paras.push(heading('결정사항'));
    decs.forEach((d, i) =>
      paras.push(textPara(`${i + 1}. ${d}`, { indent: { left: 280 } }))
    );
  }

  if (items.length > 0) {
    paras.push(heading('액션아이템'));
    for (const it of items) {
      const due = it.due_date ? ` (기한: ${it.due_date})` : '';
      const pri = it.priority === 'high' ? ' [긴급]' : '';
      paras.push(textPara(`• ${it.task} — ${it.assignee}${due}${pri}`, { indent: { left: 280 } }));
    }
  }

  if (next) {
    paras.push(heading('다음 회의'));
    paras.push(textPara(next, { indent: { left: 280 } }));
  }

  return paras.length > 0 ? paras : [new Paragraph({ children: [] })];
}

// ── 메인 빌더 ─────────────────────────────────────────
export async function buildMeetingDocument({
  analyzedData, extractedData, meetingDate, rawTranscript,
}) {
  const projName = extractedData?.project_name ?? analyzedData?.meeting_title ?? '';
  const agenda   = (analyzedData?.sections ?? []).map(s => s.title).join(', ');
  const venue    = extractedData?.venue ?? '';
  const extPart  = (extractedData?.external_participants ?? []).join(', ');
  const intPart  = (extractedData?.internal_participants
    ?? analyzedData?.participants ?? []).join(', ');

  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const d = meetingDate ? new Date(meetingDate) : new Date();
  const dateDisplay = meetingDate ? `${meetingDate} (${DAYS[d.getDay()]})` : '';

  // Row 0: 제목
  const titleRow = new TableRow({
    height: { value: 560, rule: 'atLeast' },
    children: [new TableCell({
      width: { size: TBL_W, type: WidthType.DXA },
      columnSpan: 6,
      borders: { top: NONE, left: NONE, right: NONE, bottom: B() },
      margins: cellMar,
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '회의 결과 보고서', font: { name: FONT }, bold: true, size: 34 })],
      })],
    })],
  });

  // Row 1: 연구명
  const projectRow = new TableRow({
    height: { value: 560, rule: 'atLeast' },
    children: [
      labelCell('연구명', COL.c1),
      valueCell(textPara(projName), W_VALUE5, { span: 5, noRight: true }),
    ],
  });

  // Row 2: 회의안건
  const agendaRow = new TableRow({
    height: { value: 560, rule: 'atLeast' },
    children: [
      labelCell('회의안건', COL.c1),
      valueCell(textPara(agenda), W_VALUE5, { span: 5, noRight: true }),
    ],
  });

  // Row 3: 일시 / 장소
  const dateRow = new TableRow({
    height: { value: 446, rule: 'atLeast' },
    children: [
      labelCell('일    시', COL.c1),
      valueCell(textPara(dateDisplay), W_DATE, { span: 3 }),
      new TableCell({                                         // 장소 라벨
        width: { size: COL.c5, type: WidthType.DXA },
        borders: innerBorders(),
        shading: { fill: LABEL_BG, type: ShadingType.CLEAR, color: LABEL_BG },
        margins: cellMar,
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '장소', font: { name: FONT }, bold: true, size: 22 })],
        })],
      }),
      valueCell(textPara(venue), W_VENUE, { noRight: true }),
    ],
  });

  // Row 4: 참석자 외부 (참석자 라벨 2행 병합)
  const partExtRow = new TableRow({
    height: { value: 516, rule: 'atLeast' },
    children: [
      new TableCell({                                         // 참석자 라벨 (rowSpan=2)
        width: { size: COL.c1, type: WidthType.DXA },
        rowSpan: 2,
        borders: labelBorders(),
        shading: { fill: LABEL_BG, type: ShadingType.CLEAR, color: LABEL_BG },
        margins: cellMar,
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          alignment: AlignmentType.DISTRIBUTE,
          children: [new TextRun({ text: '참석자', font: { name: FONT }, bold: true, size: 22 })],
        })],
      }),
      new TableCell({                                         // 외부 라벨
        width: { size: COL.c2, type: WidthType.DXA },
        borders: innerBorders(),
        margins: cellMar,
        verticalAlign: VerticalAlign.CENTER,
        children: [textPara('외부', { indent: { left: 148 } })],
      }),
      valueCell(textPara(extPart), W_PART, { span: 4, noRight: true }),
    ],
  });

  // Row 5: 참석자 내부
  const partIntRow = new TableRow({
    height: { value: 503, rule: 'atLeast' },
    children: [
      new TableCell({
        width: { size: COL.c2, type: WidthType.DXA },
        borders: innerBorders(),
        margins: cellMar,
        verticalAlign: VerticalAlign.CENTER,
        children: [textPara('내부', { indent: { left: 148 } })],
      }),
      valueCell(textPara(intPart), W_PART, { span: 4, noRight: true }),
    ],
  });

  // Row 6: 회의 내용 (큰 셀)
  const contentRow = new TableRow({
    height: { value: 10490, rule: 'atLeast' },
    children: [
      labelCell('회의 내용', COL.c1),
      valueCell(buildContent(analyzedData, extractedData), W_VALUE5, {
        span: 5, noRight: true, valign: VerticalAlign.TOP,
      }),
    ],
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: MARGIN,
        },
      },
      children: [
        new Table({
          width: { size: TBL_W, type: WidthType.DXA },
          columnWidths: [COL.c1, COL.c2, COL.c3, COL.c4, COL.c5, COL.c6],
          borders: { top: B(), bottom: B(), left: B(), right: B(), insideH: B(), insideV: B() },
          rows: [titleRow, projectRow, agendaRow, dateRow, partExtRow, partIntRow, contentRow],
        }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}
