
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';

const NotFound = () => {
  const location = useLocation();

  return (
    <div className="min-h-screen neon-liquid-bg flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md mx-auto animate-fade-in liquid-glass-surface liquid-glass-highlight p-8">
        <Logo className="mx-auto mb-6" />
        
        <div className="space-y-4">
          <h1 className="text-7xl font-bold text-primary">404</h1>
          <h2 className="text-2xl font-semibold">Page Not Found</h2>
          <p className="text-muted-foreground">
            We couldn't find the page you were looking for: 
            <span className="font-mono text-sm bg-muted px-2 py-1 rounded ml-1">
              {location.pathname}
            </span>
          </p>
          
          <div className="pt-6">
            <Link to="/">
              <Button>
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  className="h-4 w-4 mr-2"
                >
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                Return to Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
