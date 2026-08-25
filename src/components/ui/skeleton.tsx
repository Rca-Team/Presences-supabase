import { cn } from "@/lib/utils"
import { motion, HTMLMotionProps } from "framer-motion"
import * as React from "react"

interface SkeletonProps extends Omit<HTMLMotionProps<"div">, "children"> {
  className?: string;
}

function Skeleton({
  className,
  ...props
}: SkeletonProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "relative overflow-hidden rounded-xl bg-muted/50",
        className
      )}
      {...props}
    >
      {/* Shimmer effect */}
      <motion.div
        className="absolute inset-0 -translate-x-full"
        animate={{ x: ['0%', '200%'] }}
        transition={{ 
          duration: 1.5, 
          repeat: Infinity, 
          ease: "linear",
          repeatDelay: 0.5
        }}
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
        }}
      />
    </motion.div>
  )
}

// Enhanced skeleton variants for different use cases
function SkeletonCard({
  className,
}: {
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
      className={cn(
        "relative overflow-hidden rounded-3xl bg-card/50 backdrop-blur-sm border border-border/30 p-6",
        className
      )}
    >
      <div className="space-y-4">
        <Skeleton className="h-4 w-1/3 rounded-lg" />
        <Skeleton className="h-8 w-1/2 rounded-lg" />
        <Skeleton className="h-3 w-2/3 rounded-lg" />
      </div>
      
      {/* Animated gradient overlay */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
        animate={{ x: ['-100%', '200%'] }}
        transition={{ 
          duration: 2, 
          repeat: Infinity, 
          ease: "linear"
        }}
      />
    </motion.div>
  )
}

function SkeletonAvatar({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16"
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, type: 'spring' }}
      className={cn(
        "relative overflow-hidden rounded-full bg-muted/50",
        sizeClasses[size],
        className
      )}
    >
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        style={{
          background: 'conic-gradient(from 0deg, transparent, rgba(255,255,255,0.1), transparent)',
        }}
      />
    </motion.div>
  )
}

function SkeletonText({
  className,
  lines = 3,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={cn("space-y-2", className)}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1, duration: 0.3 }}
        >
          <Skeleton 
            className={cn(
              "h-3 rounded-lg",
              i === lines - 1 ? "w-2/3" : "w-full"
            )} 
          />
        </motion.div>
      ))}
    </motion.div>
  )
}

function SkeletonButton({
  className,
}: {
  className?: string;
}) {
  return (
    <Skeleton 
      className={cn("h-11 w-24 rounded-xl", className)} 
    />
  )
}

export { Skeleton, SkeletonCard, SkeletonAvatar, SkeletonText, SkeletonButton }