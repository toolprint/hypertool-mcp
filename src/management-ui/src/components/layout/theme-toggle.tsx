import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme, type Theme } from "@/providers/theme-provider";
import { cn } from "@/lib/utils";

const themes: Theme[] = ["light", "dark", "system"];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const nextTheme = () => {
    const index = themes.indexOf(theme);
    const next = themes[(index + 1) % themes.length];
    setTheme(next);
  };

  const icon = theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />;

  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={nextTheme}
      title={`Switch theme (current: ${theme})`}
      className={cn("shrink-0")}
      aria-label="Toggle theme"
    >
      {icon}
    </Button>
  );
}
