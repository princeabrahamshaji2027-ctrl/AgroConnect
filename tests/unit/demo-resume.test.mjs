// The synthetic demo resume is a structurally valid PDF and says plainly that it is not a real qualification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoResumePdf, DEMO_RESUME_FILE } from '../../scripts/production/demo-resume.mjs';

test('demo resume: valid PDF 1.4 with correct xref offsets, marked as a demo document', () => {
  const buf = demoResumePdf({ name: 'Asha Varghese', district: 'Idukki', specialization: 'Cardamom, tea and spices (test)' });
  const s = buf.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4\n'));
  assert.ok(s.endsWith('%%EOF\n'));
  assert.match(s, /\(DEMO DOCUMENT - NOT A REAL QUALIFICATION\)/);
  assert.match(s, /\\\(test\\\)/, 'parentheses are escaped');
  const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(s)[1]);
  assert.ok(s.slice(startxref).startsWith('xref\n0 6\n'));
  const offsets = s.slice(startxref).split('\n').slice(3, 8).map((l) => Number(l.slice(0, 10)));
  offsets.forEach((o, i) => assert.ok(s.slice(o).startsWith(`${i + 1} 0 obj`), `object ${i + 1}`));
  const len = Number(/\/Length (\d+)/.exec(s)[1]);
  const stream = s.slice(s.indexOf('stream\n') + 7, s.indexOf('\nendstream'));
  assert.equal(Buffer.byteLength(stream, 'latin1'), len);
  assert.match(DEMO_RESUME_FILE, /^\d{10,16}_cv\.pdf$/);
});
