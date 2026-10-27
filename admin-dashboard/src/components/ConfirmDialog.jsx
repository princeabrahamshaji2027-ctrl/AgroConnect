import React from 'react';

// Confirmation dialog (replaces window.confirm). Children, if given, are shown under the message (e.g. a reason field).
export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, busy = false,
  onConfirm, onCancel, children,
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <div className="max-w-md w-full card-bg rounded-xl border border-outline-variant p-6 flex flex-col gap-4 shadow-2xl">
        <h2 id="confirm-dialog-title" className="font-headline-md text-on-surface font-bold">{title}</h2>
        {message && <p className="text-body-sm text-on-surface-variant leading-5">{message}</p>}
        {children}
        <div className="flex justify-end gap-3 border-t border-outline-variant/30 pt-3">
          <button type="button" onClick={onCancel} disabled={busy}
            className="bg-surface-variant text-on-surface px-4 py-2 rounded-lg font-label-md cursor-pointer disabled:opacity-50">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} disabled={busy}
            className={`${danger ? 'bg-error text-on-error' : 'bg-primary-container text-on-primary-container'} font-semibold px-4 py-2 rounded-lg font-label-md cursor-pointer disabled:opacity-50`}>
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Promise-based confirm for event handlers: const [confirm, confirmDialog] = useConfirm(); render {confirmDialog};
// if (!(await confirm({ title, message, confirmLabel, danger }))) return;
export function useConfirm() {
  const [state, setState] = React.useState(null);
  const confirm = React.useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const close = (answer) => { state?.resolve(answer); setState(null); };
  const dialog = (
    <ConfirmDialog
      open={!!state}
      title={state?.title}
      message={state?.message}
      confirmLabel={state?.confirmLabel}
      danger={state?.danger}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );
  return [confirm, dialog];
}
