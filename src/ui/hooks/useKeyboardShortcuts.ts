import { useInput } from 'ink';

interface KeyboardShortcutProps {
  onToggleMode: () => void;
  onShowCommandPalette: () => void;
  onFocusPrompt: () => void;
  onRunTests: () => void;
  onRollback: () => void;
  onCreatePR: () => void;
  onMerge: () => void;
  onExit: () => void;
}

export function useKeyboardShortcuts(props: KeyboardShortcutProps) {
  useInput((input, key) => {
    // F2: Toggle Easy/Pro mode
    if (key.f2) {
      props.onToggleMode();
      return;
    }

    // F5: Run tests
    if (key.f5) {
      props.onRunTests();
      return;
    }

    // F7: Rollback changes
    if (key.f7) {
      props.onRollback();
      return;
    }

    // F8: Create PR
    if (key.f8) {
      props.onCreatePR();
      return;
    }

    // F9: Merge to main
    if (key.f9) {
      props.onMerge();
      return;
    }

    // /: Show command palette
    if (input === '/') {
      props.onShowCommandPalette();
      return;
    }

    // Ctrl+C: Exit
    if (key.ctrl && input === 'c') {
      props.onExit();
      return;
    }

    // Enter: Focus prompt (if not already focused)
    if (key.return) {
      props.onFocusPrompt();
      return;
    }
  });
}