import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-95 backdrop-blur-xl border border-white/15",
  {
    variants: {
      variant: {
        default: "bg-gradient-ios-blue text-white shadow-lg shadow-ios-blue/30 hover:shadow-xl hover:shadow-ios-blue/40 hover:-translate-y-0.5",
        destructive:
          "bg-gradient-to-r from-ios-red to-ios-pink text-white shadow-lg shadow-ios-red/30 hover:shadow-xl hover:shadow-ios-red/40 hover:-translate-y-0.5",
        outline:
          "border-ios-blue/30 bg-card/55 dark:bg-card/30 hover:bg-ios-blue/10 hover:border-ios-blue/50 text-foreground",
        secondary:
          "bg-secondary/70 text-secondary-foreground hover:bg-secondary/80 hover:-translate-y-0.5",
        ghost: "bg-card/30 border-white/10 hover:bg-accent/70 hover:text-accent-foreground",
        link: "text-ios-blue underline-offset-4 hover:underline",
        ios: "bg-gradient-ios-blue text-white shadow-lg shadow-ios-blue/40 hover:shadow-xl hover:shadow-ios-blue/50 hover:-translate-y-1 hover:scale-[1.02]",
        "ios-green": "bg-gradient-ios-green text-white shadow-lg shadow-ios-green/40 hover:shadow-xl hover:shadow-ios-green/50 hover:-translate-y-1 hover:scale-[1.02]",
        "ios-pink": "bg-gradient-ios-sunset text-white shadow-lg shadow-ios-pink/40 hover:shadow-xl hover:shadow-ios-pink/50 hover:-translate-y-1 hover:scale-[1.02]",
        "ios-glass": "bg-white/20 dark:bg-white/10 backdrop-blur-xl border border-white/30 text-foreground hover:bg-white/30 dark:hover:bg-white/20",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 rounded-lg px-4",
        lg: "h-12 rounded-xl px-8 text-base",
        xl: "h-14 rounded-2xl px-10 text-lg",
        icon: "h-11 w-11 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        style={{ transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }