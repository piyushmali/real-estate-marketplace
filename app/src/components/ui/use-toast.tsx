// Adapted from https://ui.shadcn.com/docs/components/toast
import { useState, useEffect, createContext, useContext, ReactNode } from 'react';

interface Toast {
  id: string;
  title?: string;
  description?: string;
  status?: 'success' | 'error' | 'info';
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  toast: (props: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = ({ title, description, status = 'info', duration = 5000 }: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID();
    const newToast = { id, title, description, status, duration };
    setToasts((currentToasts) => [...currentToasts, newToast]);
  };

  const dismiss = (id: string) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  
  return context;
}

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="fixed bottom-0 right-0 p-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, toast.duration);

    return () => clearTimeout(timer);
  }, [toast.duration, onDismiss]);

  const statusClasses = {
    success: 'bg-green-100 border-green-500 text-green-800',
    error: 'bg-red-100 border-red-500 text-red-800',
    info: 'bg-blue-100 border-blue-500 text-blue-800',
  };

  return (
    <div
      className={`rounded-lg border p-4 shadow-md ${statusClasses[toast.status || 'info']} max-w-sm animate-fade-in`}
      role="alert"
    >
      {toast.title && <h3 className="font-medium mb-1">{toast.title}</h3>}
      {toast.description && <div className="text-sm">{toast.description}</div>}
      <button
        onClick={onDismiss}
        className="absolute top-1 right-1 p-1 rounded-full hover:bg-gray-200"
        aria-label="Close"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}

// Export a simplified interface for components that don't need the full context
export const toast = {
  success: (props: { title?: string; description?: string }) => {
    const { toast } = useToast();
    toast({ ...props, status: 'success' });
  },
  error: (props: { title?: string; description?: string }) => {
    const { toast } = useToast();
    toast({ ...props, status: 'error' });
  },
  info: (props: { title?: string; description?: string }) => {
    const { toast } = useToast();
    toast({ ...props, status: 'info' });
  },
}; 