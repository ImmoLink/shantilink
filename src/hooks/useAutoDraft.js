import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { InteractionManager } from 'react-native';

/**
 * Persist form state automatically so zero data is lost if the user
 * leaves the app mid-saisie. Debounces writes to 800 ms to avoid
 * hammering AsyncStorage on every keystroke.
 *
 * Flow:
 *   1. On mount → if a saved draft exists, set hasDraft=true and store
 *      the raw data in pendingDraft (not applied to form yet).
 *   2. Component shows <DraftBanner /> while hasDraft is true.
 *   3. User taps "Reprendre" → resumeDraft() copies pendingDraft → draft.
 *   4. User taps "Recommencer" → clearDraft() resets everything.
 *   5. Any field change → updateDraft(partial) auto-saves after 800 ms.
 *   6. Successful submit → clearDraft() removes the key.
 */
export function useAutoDraft(draftKey, initialValue) {
  const initialRef = useRef(initialValue);
  const debounceTimer = useRef(null);

  const [draft, setDraft] = useState(initialValue);
  const [pendingDraft, setPendingDraft] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [savedVisible, setSavedVisible] = useState(false);

  // Load any existing draft on mount
  useEffect(() => {
    InteractionManager.runAfterInteractions(async () => {
      try {
        const stored = await AsyncStorage.getItem(draftKey);
        if (stored) {
          const { _savedAt, ...data } = JSON.parse(stored);
          // Only surface the banner if there's meaningful data
          const hasData = Object.values(data).some(v => v !== '' && v !== null && v !== undefined);
          if (hasData) {
            setPendingDraft(data);
            setLastSavedAt(new Date(_savedAt));
            setHasDraft(true);
          }
        }
      } catch (_) {}
    });
  }, [draftKey]);

  const updateDraft = useCallback((partial) => {
    setDraft(prev => {
      const next = { ...prev, ...partial };
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        InteractionManager.runAfterInteractions(() => {
          AsyncStorage.setItem(
            draftKey,
            JSON.stringify({ ...next, _savedAt: new Date().toISOString() })
          )
            .then(() => {
              setLastSavedAt(new Date());
              setSavedVisible(true);
              setTimeout(() => setSavedVisible(false), 2000);
            })
            .catch(() => {});
        });
      }, 800);
      return next;
    });
  }, [draftKey]);

  const resumeDraft = useCallback(() => {
    if (pendingDraft) {
      setDraft(prev => ({ ...prev, ...pendingDraft }));
      setPendingDraft(null);
      setHasDraft(false);
    }
  }, [pendingDraft]);

  const clearDraft = useCallback(async () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    try { await AsyncStorage.removeItem(draftKey); } catch (_) {}
    setDraft(initialRef.current);
    setPendingDraft(null);
    setHasDraft(false);
    setLastSavedAt(null);
  }, [draftKey]);

  return {
    draft,
    updateDraft,
    resumeDraft,
    clearDraft,
    hasDraft,
    pendingDraft,
    lastSavedAt,
    savedVisible,
  };
}
