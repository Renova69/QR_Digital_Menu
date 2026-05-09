import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
  durationMs?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type,
  onClose,
  durationMs = 4000,
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border backdrop-blur-md transition-all duration-300 ${
        visible
          ? 'translate-y-0 opacity-100'
          : 'translate-y-4 opacity-0'
      } ${
        type === 'success'
          ? 'bg-emerald-50/95 border-emerald-200 text-emerald-800'
          : 'bg-red-50/95 border-red-200 text-red-800'
      }`}
      role="alert"
    >
      {type === 'success' ? (
        <CheckCircle className="h-5 w-5 flex-shrink-0" />
      ) : (
        <XCircle className="h-5 w-5 flex-shrink-0" />
      )}
      <span className="text-sm font-semibold">{message}</span>
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(onClose, 300);
        }}
        className="ml-2 p-1 rounded-full hover:bg-black/10 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export const useToast = () => {
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const ToastComponent = toast ? (
    <Toast
      message={toast.message}
      type={toast.type}
      onClose={() => setToast(null)}
    />
  ) : null;

  return { showToast, ToastComponent };
};
