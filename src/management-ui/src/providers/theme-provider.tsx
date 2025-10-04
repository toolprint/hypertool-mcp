import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ThemeProvider as NextThemeProvider } from "next-themes";

export type Theme = "light" | "dark" | "system";

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
}>({
  theme: "system",
  setTheme: () => {}
});

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme"
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);

  const applyTheme = useCallback((value: Theme) => {
    if (value === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.toggle("dark", prefersDark);
      return;
    }

    document.documentElement.classList.toggle("dark", value === "dark");
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey) as Theme | null;
    if (stored) {
      setThemeState(stored);
      applyTheme(stored);
    } else {
      applyTheme(defaultTheme);
    }
  }, [applyTheme, defaultTheme, storageKey]);

  useEffect(() => {
    const listener = (event: MediaQueryListEvent) => {
      if (theme === "system") {
        document.documentElement.classList.toggle("dark", event.matches);
      }
    };
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [theme]);

  const setTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme);
    window.localStorage.setItem(storageKey, nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <NextThemeProvider attribute="class" defaultTheme={defaultTheme} value={{ light: "light", dark: "dark" }}>
        {children}
      </NextThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
