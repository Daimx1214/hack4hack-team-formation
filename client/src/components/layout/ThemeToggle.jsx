import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

// Three-way theme toggle (Build Spec §3.4): Light / Dark / System.
const OPTIONS = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

export default function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={preference === value}
          aria-label={`${label} theme`}
          title={`${label} theme`}
          onClick={() => setPreference(value)}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}
