import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
  action?: ToastAction;
}

interface ToastContextValue {
  show: (toast: Omit<ToastItem, 'id'>) => string;
  success: (message: string, title?: string, action?: ToastAction) => string;
  error: (message: string, title?: string, action?: ToastAction) => string;
  warning: (message: string, title?: string, action?: ToastAction) => string;
  info: (message: string, title?: string, action?: ToastAction) => string;
  dismiss: (id: string) => void;
}


const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newToast: ToastItem = { ...toast, id };
    setToasts((prev) => [...prev, newToast]);

    const duration = toast.duration ?? (toast.type === 'error' ? 6000 : 4000);
    setTimeout(() => {
      dismiss(id);
    }, duration);

    return id;
  }, [dismiss]);

  const success = useCallback((message: string, title?: string, action?: ToastAction) => {
    return show({ type: 'success', message, title: title || 'Success', action });
  }, [show]);

  const error = useCallback((message: string, title?: string, action?: ToastAction) => {
    return show({ type: 'error', message, title: title || 'Error', action });
  }, [show]);

  const warning = useCallback((message: string, title?: string, action?: ToastAction) => {
    return show({ type: 'warning', message, title: title || 'Warning', action });
  }, [show]);

  const info = useCallback((message: string, title?: string, action?: ToastAction) => {
    return show({ type: 'info', message, title: title || 'Note', action });
  }, [show]);

  return (
    <ToastContext.Provider value={{ show, success, error, warning, info, dismiss }}>
      {children}
      <div className="ui-toast-container" role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`ui-toast-item ui-toast-${toast.type}`}
            role="status"
            aria-live="polite"
          >
            <div style={{ flexShrink: 0, marginTop: 2 }}>
              {toast.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400" />}
              {toast.type === 'error' && <AlertCircle size={16} className="text-rose-400" />}
              {toast.type === 'warning' && <AlertTriangle size={16} className="text-amber-400" />}
              {toast.type === 'info' && <Info size={16} className="text-cyan-400" />}
            </div>

            <div className="ui-toast-content">
              {toast.title && <div className="ui-toast-title">{toast.title}</div>}
              <div className="ui-toast-message">{toast.message}</div>
            </div>

            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  dismiss(toast.id);
                }}
                className="ui-btn ui-btn-outline ui-btn-sm"
                style={{
                  padding: '3px 10px',
                  height: 26,
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--accent-cyan)',
                  borderColor: 'rgba(0, 242, 254, 0.4)',
                  background: 'rgba(0, 242, 254, 0.08)',
                  cursor: 'pointer'
                }}
              >
                {toast.action.label}
              </button>
            )}

            <button
              onClick={() => dismiss(toast.id)}
              className="ui-toast-close"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );

};
