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
    <div className="min-h-screen flex flex-col overflow-x-clip max-w-full w-full">
      {!isMobile && <Navbar />}
      
      {/* Apple Nano-Textured Atmospheric Ambient Glows — zero GPU filter penalty, smooth 120fps scrolling */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none will-change-transform max-w-full" style={{ contain: 'strict' }} aria-hidden="true">
        <div 
          className="absolute top-16 left-8 w-60 sm:w-72 md:w-[30rem] h-60 sm:h-72 md:h-[30rem] rounded-full opacity-35 dark:opacity-20 pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.18) 0%, rgba(99, 102, 241, 0.05) 45%, transparent 70%)',
            transform: 'translateZ(0)',
          }}
        />
        <div 
          className="absolute bottom-20 right-4 sm:right-8 w-64 sm:w-80 md:w-[32rem] h-64 sm:h-80 md:h-[32rem] rounded-full opacity-30 dark:opacity-15 pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.14) 0%, rgba(6, 182, 212, 0.04) 45%, transparent 70%)',
            transform: 'translateZ(0)',
          }}
        />
        <div 
          className="absolute top-1/3 right-1/4 w-64 sm:w-80 md:w-[34rem] h-64 sm:h-80 md:h-[34rem] rounded-full opacity-25 dark:opacity-15 pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, transparent 70%)',
            transform: 'translateZ(0)',
          }}
        />
      </div>
      
      <main 
        className={cn(
          "flex-1 pt-20 md:pt-28 pb-8 md:pb-12 px-3 sm:px-6 lg:px-8 premium-glass-main max-w-full",
          fullWidth ? "w-full" : "max-w-7xl mx-auto w-full",
          isMobile && "pt-1 px-0 pb-0 rounded-none border-0 bg-transparent shadow-none backdrop-blur-none",
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