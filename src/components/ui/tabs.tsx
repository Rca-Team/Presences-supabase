import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "relative inline-flex items-center justify-center gap-0.5",
      "rounded-2xl p-1",
      "bg-white/40 dark:bg-white/[0.06]",
      "backdrop-blur-2xl backdrop-saturate-[1.6]",
      "border border-white/30 dark:border-white/10",
      "shadow-[0_2px_16px_-4px_rgba(0,0,0,0.1),inset_0_0.5px_0_rgba(255,255,255,0.4)]",
      "dark:shadow-[0_2px_16px_-4px_rgba(0,0,0,0.4),inset_0_0.5px_0_rgba(255,255,255,0.06)]",
      "text-muted-foreground overflow-hidden",
      className
    )}
    {...props}
  >
    {/* Top edge highlight */}
    <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 dark:via-white/10 to-transparent" />
    {props.children}
  </TabsPrimitive.List>
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative inline-flex items-center justify-center whitespace-nowrap",
      "rounded-xl px-4 py-2 text-sm font-semibold",
      "ring-offset-background transition-all duration-300",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:pointer-events-none disabled:opacity-50",
      // Inactive state
      "text-muted-foreground/70 hover:text-foreground/90",
      // Active state - glass pill
      "data-[state=active]:text-foreground",
      "data-[state=active]:bg-white/70 dark:data-[state=active]:bg-white/[0.12]",
      "data-[state=active]:backdrop-blur-xl",
      "data-[state=active]:shadow-[0_1px_8px_-2px_rgba(0,0,0,0.1),inset_0_0.5px_0_rgba(255,255,255,0.5)]",
      "dark:data-[state=active]:shadow-[0_1px_8px_-2px_rgba(0,0,0,0.3),inset_0_0.5px_0_rgba(255,255,255,0.08)]",
      "data-[state=active]:border data-[state=active]:border-white/40 dark:data-[state=active]:border-white/10",
      // Tap scale
      "active:scale-[0.96]",
      className
    )}
    style={{ transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
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
      "animate-fade-in",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
