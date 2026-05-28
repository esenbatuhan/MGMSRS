"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <button className="theme-toggle-skeleton" aria-hidden="true" style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'transparent' }}></button>;
  }

  const currentTheme = theme === "system" ? systemTheme : theme;
  const isDark = currentTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="theme-toggle-btn"
      aria-label="Karanlık / Aydınlık Mod Değiştir"
      title="Karanlık / Aydınlık Mod Değiştir"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        color: '#fff',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        fontSize: '16px'
      }}
    >
      {isDark ? '🌙' : '☀️'}
    </button>
  );
}
