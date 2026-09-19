import { useEffect, useId, useRef, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import type { ThemePreference, ResolvedTheme } from "../lib/theme";
import "./ThemeSwitcher.css";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Device setting", icon: Monitor },
] as const;

export default function ThemeSwitcher({ preference, resolved, chooseTheme }: {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  chooseTheme: (theme: ThemePreference) => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const Icon = resolved === "dark" ? Moon : Sun;

  useEffect(() => {
    if (!open) return;
    container.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return (
    <div className="theme-picker" ref={container}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}>
      <button type="button" className="theme-trigger" ref={trigger}
        aria-label={`Appearance: ${resolved === "dark" ? "Dark" : "Light"}`}
        title="Change appearance" aria-expanded={open} aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}>
        <Icon size={19} aria-hidden="true" />
      </button>
      {open && (
        <div id={panelId} className="theme-panel" role="group" aria-label="Appearance">
          <span className="theme-panel-title">Appearance</span>
          {options.map(({ value, label, icon: OptionIcon }) => (
            <button type="button" key={value} className="theme-option" aria-pressed={preference === value}
              onClick={() => { chooseTheme(value); setOpen(false); trigger.current?.focus(); }}>
              <OptionIcon size={17} aria-hidden="true" />
              <span>{label}</span>
              {preference === value && <Check className="theme-check" size={16} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
