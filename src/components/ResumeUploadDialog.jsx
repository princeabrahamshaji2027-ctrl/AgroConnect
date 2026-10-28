import React, { useRef, useState } from 'react';
import Dialog from './Dialog';
import { validatePdfFile } from '../utils/validation';
import { supabase } from '../supabase';

// Replace the resume of the signed-in user's latest Pending/Approved expert application.
// The file goes to expert-cvs/<uid>/<time>_cv.pdf, then the submit-resume Edge Function checks it is a real PDF
// (it deletes a refused file) and attaches it; the old file stays in storage for the history.
export default function ResumeUploadDialog({ open, onClose, onDone }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const close = () => { if (busy) return; setFile(null); setError(null); onClose(); };

  const pick = async (e) => {
    const f = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!f) return;
    const v = await validatePdfFile(f, 5);
    if (!v.isValid) { setFile(null); setError(v.error); return; }
    setError(null);
    setFile(f);
  };

  const upload = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in again.');
      const path = `${user.id}/${Date.now()}_cv.pdf`;
      const { error: upErr } = await supabase.storage.from('expert-cvs').upload(path, file, { upsert: false, contentType: 'application/pdf' });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      const { data, error: fnErr } = await supabase.functions.invoke('submit-resume', { body: { action: 'replace', path } });
      if (fnErr || !data?.application_id) {
        let msg = 'Your resume was not saved. Please try again.';
        try { msg = (await fnErr?.context?.json())?.error || msg; } catch { /* keep default */ }
        throw new Error(msg);
      }
      setFile(null);
      onDone();
    } catch (err) {
      setError(/fetch|network/i.test(err.message || '') ? 'No connection. Your resume was not saved — please try again.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      isOpen={open}
      title="Update resume (PDF)"
      message="Choose your resume as a PDF file (up to 5 MB). The admin will see the new file."
      onCancel={close}
      onConfirm={upload}
      confirmText={busy ? 'Uploading…' : 'Upload'}
      confirmDisabled={!file || busy}
    >
      <input ref={inputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={pick} data-testid="resume-input" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '8px 0 12px' }}>
        <button type="button" className="btn btn-secondary" onClick={() => inputRef.current?.click()} disabled={busy}
          style={{ padding: '10px 14px', fontSize: '13px', borderRadius: '12px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px', verticalAlign: 'middle', marginRight: '6px' }}>upload_file</span>
          {file ? file.name : 'Choose PDF'}
        </button>
        {error && <span role="alert" style={{ color: 'var(--error)', fontSize: '12px' }}>{error}</span>}
      </div>
    </Dialog>
  );
}
