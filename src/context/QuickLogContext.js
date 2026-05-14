import React, { createContext, useContext, useState, useCallback } from 'react';

const QuickLogContext = createContext(null);

export function QuickLogProvider({ children }) {
  const [visible, setVisible] = useState(false);
  const [onSaved, setOnSaved] = useState(null);

  const openQuickLog = useCallback((savedCallback) => {
    if (savedCallback) setOnSaved(() => savedCallback);
    setVisible(true);
  }, []);

  const closeQuickLog = useCallback(() => {
    setVisible(false);
    setOnSaved(null);
  }, []);

  const notifySaved = useCallback(() => {
    if (onSaved) onSaved();
    closeQuickLog();
  }, [onSaved, closeQuickLog]);

  return (
    <QuickLogContext.Provider value={{ visible, openQuickLog, closeQuickLog, notifySaved }}>
      {children}
    </QuickLogContext.Provider>
  );
}

export const useQuickLog = () => useContext(QuickLogContext);
