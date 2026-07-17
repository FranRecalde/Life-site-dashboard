import { useEffect, useRef } from 'react';

type ShortcutActions = {
  onFocusSearch: () => void;
  onFocusNotes: () => void;
  onFocusTasks: () => void;
  onRefresh: () => void;
  onSwitchTab: (tabIndex: number) => void;
  onClosePanels: () => void;
};

export function useKeyboardShortcuts(actions: ShortcutActions) {
  const actionsRef = useRef(actions);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts if the user is currently typing in input elements
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      if (isTyping) {
        return;
      }

      const key = e.key;

      if (key === '/') {
        e.preventDefault();
        actionsRef.current.onFocusSearch();
      } else if (key.toLowerCase() === 'n') {
        e.preventDefault();
        actionsRef.current.onFocusNotes();
      } else if (key.toLowerCase() === 't') {
        e.preventDefault();
        actionsRef.current.onFocusTasks();
      } else if (key.toLowerCase() === 'r') {
        e.preventDefault();
        actionsRef.current.onRefresh();
      } else if (key === '1') {
        e.preventDefault();
        actionsRef.current.onSwitchTab(0); // Combined
      } else if (key === '2') {
        e.preventDefault();
        actionsRef.current.onSwitchTab(1); // Personal
      } else if (key === '3') {
        e.preventDefault();
        actionsRef.current.onSwitchTab(2); // Professional
      } else if (key === 'Escape') {
        e.preventDefault();
        actionsRef.current.onClosePanels();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
