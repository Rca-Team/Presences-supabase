import React, { forwardRef, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

interface TouchFriendlyButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'ios' | 'ios-green' | 'ios-pink' | 'ios-glass';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fullWidth?: boolean;
  haptic?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  children?: ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  loading?: boolean;
}

const TouchFriendlyButton = forwardRef<HTMLButtonElement, TouchFriendlyButtonProps>(({
  children,
  className,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  haptic = true,
  icon,
  iconPosition = 'left',
  onClick,
  disabled,
  type = 'button',
  loading = false,
}, ref) => {
  const { trigger } = useHapticFeedback();
  const [ripples, setRipples] = React.useState<{ x: number; y: number; id: number }[]>([]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (haptic && !disabled && !loading) {
      trigger('light');
    }
    
    // Add ripple effect
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Date.now();
    setRipples(prev => [...prev, { x, y, id }]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id));
    }, 600);
    
    onClick?.(e);
  };

  const variantClasses = {
    primary: 'bg-gradient-to-r from-ios-blue to-ios-purple text-white shadow-lg shadow-ios-blue/30 hover:shadow-ios-blue/50',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    ghost: 'bg-transparent hover:bg-muted/50 text-foreground',
    destructive: 'bg-gradient-to-r from-ios-red to-ios-pink text-white shadow-lg shadow-ios-red/30',
    ios: 'bg-gradient-to-r from-ios-blue to-ios-purple text-white shadow-lg shadow-ios-blue/40',
    'ios-green': 'bg-gradient-to-r from-ios-green to-ios-mint text-white shadow-lg shadow-ios-green/40',
    'ios-pink': 'bg-gradient-to-r from-ios-pink to-ios-orange text-white shadow-lg shadow-ios-pink/40',
    'ios-glass': 'bg-white/20 dark:bg-white/10 backdrop-blur-xl border border-white/30 text-foreground'
  };

  const sizeClasses = {
    sm: 'min-h-[44px] min-w-[44px] px-4 py-2 text-sm rounded-xl gap-2',
    md: 'min-h-[50px] min-w-[50px] px-6 py-3 text-base rounded-2xl gap-2.5',
    lg: 'min-h-[58px] min-w-[58px] px-7 py-3.5 text-lg rounded-2xl gap-3',
    xl: 'min-h-[66px] min-w-[66px] px-8 py-4 text-xl rounded-3xl gap-4'
  };

  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={{ scale: disabled || loading ? 1 : 0.92 }}
      whileHover={{ scale: disabled || loading ? 1 : 1.03, y: -2 }}
      transition={{ type: 'spring', stiffness: 500, damping: 20 }}
      onClick={handleClick}
      disabled={disabled || loading}
      className={cn(
        'relative inline-flex items-center justify-center font-semibold overflow-hidden',
        'touch-manipulation select-none',
        'focus:outline-none focus:ring-2 focus:ring-ios-blue/50 focus:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        'active:brightness-90',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className
      )}
      style={{ transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
    >
      {/* Ripple effects */}
      <AnimatePresence>
        {ripples.map(ripple => (
          <motion.span
            key={ripple.id}
            initial={{ scale: 0, opacity: 0.5 }}
            animate={{ scale: 4, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="absolute rounded-full bg-white/30 pointer-events-none"
            style={{
              left: ripple.x - 10,
              top: ripple.y - 10,
              width: 20,
              height: 20,
            }}
          />
        ))}
      </AnimatePresence>
      
      {/* Loading spinner */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute inset-0 flex items-center justify-center bg-inherit rounded-inherit"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
            />
          </motion.div>
        )}
      </AnimatePresence>
      
      <motion.div
        animate={{ opacity: loading ? 0 : 1 }}
        className="flex items-center gap-2"
      >
        {icon && iconPosition === 'left' && (
          <motion.span 
            className="flex-shrink-0"
            whileHover={{ rotate: [-5, 5, 0] }}
            transition={{ duration: 0.3 }}
          >
            {icon}
          </motion.span>
        )}
        {children && <span>{children}</span>}
        {icon && iconPosition === 'right' && (
          <motion.span 
            className="flex-shrink-0"
            whileHover={{ x: [0, 3, 0] }}
            transition={{ duration: 0.3 }}
          >
            {icon}
          </motion.span>
        )}
      </motion.div>
      
      {/* Shine effect */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full"
        animate={{ x: ['0%', '200%'] }}
        transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
      />
    </motion.button>
  );
});

TouchFriendlyButton.displayName = 'TouchFriendlyButton';

export default TouchFriendlyButton;