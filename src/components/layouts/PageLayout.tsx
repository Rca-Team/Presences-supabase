
import React, { ReactNode, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import Navbar from '../Navbar';
import Footer from '../Footer';
import MobileSidebar from '../MobileSidebar';
import ContactBanner from '../ContactBanner';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTheme } from '@/hooks/use-theme';

interface PageLayoutProps {
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
  noFooter?: boolean;
}

const PageLayout: React.FC<PageLayoutProps> = ({ 
  children, 
  className,
  fullWidth = false,
  noFooter = false
}) => {
  const [isPageVisible, setIsPageVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const isMobile = useIsMobile();
  const { theme } = useTheme();
  
  useEffect(() => {
    // When component mounts, delay slightly before showing to ensure animation runs
    const timer = setTimeout(() => {
      setIsPageVisible(true);
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      {!isMobile && <Navbar />}
      
      {/* Animated background orbs — light mode only (dark/Lumina hides them in CSS,
          so skipping the animations entirely saves constant compositing work) */}
      {theme !== 'dark' && (
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none neon-liquid-bg">
        <motion.div 
          initial={false}
          animate={{ 
            scale: [1, 1.3, 1],
            x: [0, 30, 0],
            y: [0, -20, 0]
          }}
          transition={{ duration: prefersReducedMotion || isMobile ? 0 : 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-20 left-8 w-32 md:w-64 h-32 md:h-64 rounded-full bg-[hsl(var(--neon-orange)/0.20)] blur-[80px]"
        />
        <motion.div 
          initial={false}
          animate={{ 
            scale: [1.2, 1, 1.2],
            x: [0, -40, 0],
            y: [0, 30, 0]
          }}
          transition={{ duration: prefersReducedMotion || isMobile ? 0 : 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-20 right-8 w-40 md:w-80 h-40 md:h-80 rounded-full bg-[hsl(var(--neon-violet)/0.20)] blur-[80px]"
        />
        <motion.div 
          initial={false}
          animate={{ 
            scale: [1, 1.4, 1],
            opacity: [0.3, 0.6, 0.3]
          }}
          transition={{ duration: prefersReducedMotion || isMobile ? 0 : 12, repeat: Infinity, ease: "easeInOut", delay: 4 }}
          className="absolute top-1/2 right-1/4 w-48 md:w-96 h-48 md:h-96 rounded-full bg-[hsl(var(--neon-pink)/0.16)] blur-[100px]"
        />
        <motion.div 
          initial={false}
          animate={{ 
            scale: [1.1, 1, 1.1],
            y: [0, -50, 0]
          }}
          transition={{ duration: prefersReducedMotion || isMobile ? 0 : 20, repeat: Infinity, ease: "easeInOut", delay: 6 }}
          className="absolute bottom-1/3 left-1/3 w-36 md:w-72 h-36 md:h-72 rounded-full bg-[hsl(var(--neon-amber)/0.16)] blur-[80px]"
        />
      </div>
      )}
      
      <motion.main 
        initial={prefersReducedMotion ? false : { opacity: 0, y: 30 }}
        animate={{ 
          opacity: isPageVisible ? 1 : 0, 
          y: prefersReducedMotion ? 0 : isPageVisible ? 0 : 30 
        }}
        transition={{ 
          duration: prefersReducedMotion ? 0.15 : 0.6, 
          ease: [0.34, 1.56, 0.64, 1]
        }}
        className={cn(
          "flex-1 pt-20 md:pt-28 pb-8 md:pb-12 px-4 md:px-6 lg:px-8 premium-glass-main",
          fullWidth ? "" : "max-w-7xl mx-auto w-full",
          isMobile && "pt-0 px-0 pb-0 rounded-none border-0 bg-transparent shadow-none backdrop-blur-none",
          className
        )}
      >
        {children}
      </motion.main>
      
      {!isMobile && <ContactBanner />}
      {!isMobile && !noFooter && <Footer />}
      {!isMobile && <MobileSidebar />}
    </div>
  );
};

export default PageLayout;