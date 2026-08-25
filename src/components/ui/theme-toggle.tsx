import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useRef, useCallback } from "react";

interface ThemeToggleProps {
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
}

export function ThemeToggle({ className, size = "icon" }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [ripple, setRipple] = useState<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggleTheme = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Trigger ripple effect
    setRipple({ x, y, active: true });

    // Create full-screen ripple overlay
    const overlay = document.createElement('div');
    overlay.className = 'theme-ripple-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 9999;
      overflow: hidden;
    `;

    const rippleCircle = document.createElement('div');
    const targetTheme = theme === "light" ? "dark" : "light";
    rippleCircle.style.cssText = `
      position: absolute;
      left: ${e.clientX}px;
      top: ${e.clientY}px;
      width: 0;
      height: 0;
      border-radius: 50%;
      background: ${targetTheme === 'dark' ? 'hsl(222.2 84% 4.9%)' : 'hsl(210 20% 98%)'};
      transform: translate(-50%, -50%);
      animation: themeRippleExpand 0.6s ease-out forwards;
    `;

    overlay.appendChild(rippleCircle);
    document.body.appendChild(overlay);

    // Change theme after ripple starts
    setTimeout(() => {
      setTheme(targetTheme);
    }, 150);

    // Cleanup
    setTimeout(() => {
      setRipple(prev => ({ ...prev, active: false }));
      overlay.remove();
    }, 600);
  }, [theme, setTheme]);

  return (
    <Button
      ref={buttonRef}
      variant="outline"
      size={size}
      onClick={toggleTheme}
      className={cn(
        "relative overflow-hidden transition-all duration-300 group",
        className
      )}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {/* Button ripple effect */}
      {ripple.active && (
        <span
          className="absolute rounded-full bg-primary/20 animate-ping"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: 20,
            height: 20,
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
      
      <div className="relative h-[1.2rem] w-[1.2rem]">
        <Sun
          className={cn(
            "absolute inset-0 h-[1.2rem] w-[1.2rem] transition-all duration-500",
            theme === "dark"
              ? "rotate-90 scale-0 opacity-0"
              : "rotate-0 scale-100 opacity-100"
          )}
        />
        <Moon
          className={cn(
            "absolute inset-0 h-[1.2rem] w-[1.2rem] transition-all duration-500",
            theme === "dark"
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-90 scale-0 opacity-0"
          )}
        />
      </div>
    </Button>
  );
}
