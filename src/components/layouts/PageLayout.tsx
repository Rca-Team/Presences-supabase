import React, { ReactNode } from 'react';
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
  const isMobile = useIsMobile();
  const { theme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      {!isMobile && <Navbar />}
      
      {/* Subtle Royal Atmospheric Ambient Glows — optimized for 120fps scrolling & zero-blink transitions */}
      {theme !== 'dark' && (
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" style={{ contain: 'strict' }} aria-hidden="true">
          <div 
            className="absolute top-16 left-8 w-64 md:w-96 h-64 md:h-96 rounded-full opacity-40 blur-3xl pointer-events-none"
            style={{
              background: 'radial-gradient(circle, hsl(var(--neon-orange, 17 96% 58%) / 0.18) 0%, transparent 70%)',
              transform: 'translate3d(0,0,0)',
              willChange: 'transform',
            }}
          />
          <div 
            className="absolute bottom-20 right-8 w-72 md:w-[28rem] h-72 md:h-[28rem] rounded-full opacity-35 blur-3xl pointer-events-none"
            style={{
              background: 'radial-gradient(circle, hsl(var(--neon-violet, 224 78% 57%) / 0.18) 0%, transparent 70%)',
              transform: 'translate3d(0,0,0)',
              willChange: 'transform',
            }}
          />
          <div 
            className="absolute top-1/3 right-1/4 w-80 md:w-[32rem] h-80 md:h-[32rem] rounded-full opacity-25 blur-3xl pointer-events-none"
            style={{
              background: 'radial-gradient(circle, hsl(var(--neon-pink, 341 100% 82%) / 0.14) 0%, transparent 70%)',
              transform: 'translate3d(0,0,0)',
              willChange: 'transform',
            }}
          />
        </div>
      )}
      
      <main 
        className={cn(
          "flex-1 pt-20 md:pt-28 pb-8 md:pb-12 px-4 md:px-6 lg:px-8 premium-glass-main",
          fullWidth ? "" : "max-w-7xl mx-auto w-full",
          isMobile && "pt-0 px-0 pb-0 rounded-none border-0 bg-transparent shadow-none backdrop-blur-none",
          className
        )}
      >
        {children}
      </main>
      
      {!isMobile && <ContactBanner />}
      {!isMobile && !noFooter && <Footer />}
      {!isMobile && <MobileSidebar />}
    </div>
  );
};

export default PageLayout;