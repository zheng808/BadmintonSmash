import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

const ToastContext = createContext<(message: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | undefined>();
  const timer = useRef<number | undefined>(undefined);
  const toast = useCallback((m: string) => {
    setMessage(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(undefined), 2200);
  }, []);
  const value = useMemo(() => toast, [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {message ? (
        <div className="toast" role="status">
          {message}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): (message: string) => void {
  return useContext(ToastContext);
}
