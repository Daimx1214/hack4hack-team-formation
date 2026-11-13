import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { X } from 'lucide-react';

// Toasts (Build Spec §4/§5.8): bottom-right on desktop, bottom-center on
// mobile, max 3 stacked, auto-dismiss 5s (errors 8s), pause on hover,
// aria-live polite (assertive for errors).

const ToastContext = createContext(null);
let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const arm = useCallback(
    (id, type) => {
      const timer = setTimeout(() => dismiss(id), type === 'error' ? 8000 : 5000);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  const push = useCallback(
    (type, message) => {
      const id = nextId;
      nextId += 1;
      setToasts((current) => [...current.slice(-2), { id, type, message }]);
      arm(id, type);
    },
    [arm]
  );

  const toast = {
    success: (message) => push('success', message),
    info: (message) => push('info', message),
    warning: (message) => push('warning', message),
    error: (message) => push('error', message),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-region">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            role={t.type === 'error' ? 'alert' : 'status'}
            aria-live={t.type === 'error' ? 'assertive' : 'polite'}
            onMouseEnter={() => {
              const timer = timers.current.get(t.id);
              if (timer) clearTimeout(timer);
            }}
            onMouseLeave={() => arm(t.id, t.type)}
          >
            <span>{t.message}</span>
            <button
              type="button"
              className="icon-btn toast-close"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
