// Synthetic one-page PDF resume for a demo expert. Valid PDF 1.4 (correct xref), clearly marked as not real.
export function demoResumePdf({ name, district, specialization }) {
  const lines = ['DEMO DOCUMENT - NOT A REAL QUALIFICATION', '', `Name: ${name} (synthetic demo profile)`,
    `District: ${district}, Kerala`, `Topic shown in the demo: ${specialization}`, '',
    'Generated for the AgroConnect demonstration dataset (community-2026-10).',
    'It does not describe a real person and is not evidence of any qualification.'];
  const esc = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = ['BT', '/F1 12 Tf', '72 790 Td', '16 TL', ...lines.map((l) => `(${esc(l)}) '`), 'ET'].join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
export const DEMO_RESUME_FILE = '1767225600000_cv.pdf';   // fixed name → re-runs reuse the same object
