import { useEffect, useRef } from 'react';
import Button from './Button';

// Confirm modal (Build Spec §4): centred, backdrop blur, ESC closes,
// focus moves in on open and returns to the trigger on close, Tab is
// trapped inside. Used for Leave / Delete confirmations.

export default function Modal({ open, onClose, title, children, actions }) {
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    triggerRef.current = document.activeElement;
    const panel = panelRef.current;
    const focusables = () =>
      panel.querySelectorAll('button, [href], input, textarea, [tabindex]:not([tabindex="-1"])');
    const first = focusables()[0];
    if (first) first.focus();

    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const items = Array.from(focusables());
        if (items.length === 0) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (triggerRef.current && triggerRef.current.focus) triggerRef.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={panelRef}>
        <h3 className="modal-title">{title}</h3>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {actions}
        </div>
      </div>
    </div>
  );
}
