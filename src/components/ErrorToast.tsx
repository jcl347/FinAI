"use client";

import { useState, useEffect } from "react";

interface ErrorToastProps {
  message: string | null;
  details?: string | null;
  onDismiss: () => void;
}

export default function ErrorToast({ message, details, onDismiss }: ErrorToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [message]);

  if (!message || !visible) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg animate-in fade-in slide-in-from-top-2">
      <div className="bg-red-950 border border-red-500/50 rounded-lg shadow-2xl shadow-red-900/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-red-300 font-semibold text-sm">Request Failed</h3>
              <p className="text-red-400 text-sm mt-1 break-words">{message}</p>
              {details && (
                <details className="mt-2">
                  <summary className="text-red-500 text-xs cursor-pointer hover:text-red-400">
                    Technical details
                  </summary>
                  <pre className="text-red-500/70 text-xs mt-1 whitespace-pre-wrap break-all bg-red-950/50 rounded p-2 max-h-32 overflow-auto">
                    {details}
                  </pre>
                </details>
              )}
            </div>
          </div>
          <button
            onClick={() => {
              setVisible(false);
              onDismiss();
            }}
            className="text-red-500 hover:text-red-300 transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
