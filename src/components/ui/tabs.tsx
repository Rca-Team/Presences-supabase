import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "relative inline-flex items-center justify-center gap-1",
      "rounded-2xl p-1.5",
      "bg-card/75 dark:bg-card/60",
      "backdrop-blur-2xl backdrop-saturate-[1.8]",
      "border border-white/20 dark:border-white/10",
      "shadow-[0_12px_32px_-10px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.25)]",
      "dark:shadow-[0_12px_32px_-10px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.08)]",
      "text-muted-foreground overflow-hidden",
      className
    )}
    {...props}
  >
    {/* Micro diagonal neon texture layer */}
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-40"
      style={{
        background:
          "repeating-linear-gradient(125deg, transparent 0px, transparent 12px, rgba(255,255,255,0.04) 12px, rgba(255,255,255,0.04) 13px)",
      }}
    />
    {/* Top edge neon highlight */}
    <span className="pointer-events-none absolute inset-x-3 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-primary/70 dark:via-primary/90 to-transparent" />
    {props.children}
  </TabsPrimitive.List>
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, style, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative z-10 inline-flex items-center justify-center whitespace-nowrap",
      "rounded-xl px-4 py-2 text-sm font-semibold",
      "ring-offset-background transition-all duration-200 ease-out",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:pointer-events-none disabled:opacity-50",
      // Inactive state
      "text-muted-foreground hover:text-foreground hover:bg-white/5 dark:hover:bg-white/[0.04]",
      // Active state - Royal Neon Glass Pill
      "data-[state=active]:text-foreground data-[state=active]:font-bold",
      "data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:via-card/90 data-[state=active]:to-accent/20",
      "data-[state=active]:backdrop-blur-xl",
      "data-[state=active]:shadow-[0_0_18px_-2px_hsl(var(--primary)/0.6),0_6px_16px_-4px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.5)]",
      "data-[state=active]:border data-[state=active]:border-primary/50 dark:data-[state=active]:border-primary/60",
      // Tap scale
      "active:scale-[0.97]",
      className
    )}
    style={{
      transition: "all 0.24s cubic-bezier(0.16, 1, 0.3, 1)",
      ...style,
    }}
    {...props}
  >
    {children}
  </TabsPrimitive.Trigger>
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-3 ring-offset-background",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "animate-fade-in data-[state=inactive]:hidden",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
