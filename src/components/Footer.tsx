
import React from 'react';
import { Link } from 'react-router-dom';
import Logo from './Logo';

const Footer = () => {
  return (
    <footer className="py-12 px-6 border-t border-border/70 bg-transparent">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="space-y-4 liquid-glass-surface liquid-glass-highlight p-5">
          <Logo />
          <p className="text-sm text-muted-foreground max-w-xs">
            Streamline attendance management with advanced facial recognition technology.
          </p>
        </div>
        
        <div className="liquid-glass-surface liquid-glass-highlight p-5">
          <h4 className="font-medium text-sm mb-4">Product</h4>
          <ul className="space-y-2">
            {['Features', 'Security', 'Pricing', 'Documentation'].map((item) => (
              <li key={item}>
                <Link to="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {item}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="liquid-glass-surface liquid-glass-highlight p-5">
          <h4 className="font-medium text-sm mb-4">Company</h4>
          <ul className="space-y-2">
            {['About', 'Careers', 'Blog', 'Contact'].map((item) => (
              <li key={item}>
                <Link to="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {item}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="liquid-glass-surface liquid-glass-highlight p-5">
          <h4 className="font-medium text-sm mb-4">Legal</h4>
          <ul className="space-y-2">
            {['Terms', 'Privacy', 'Cookies', 'Licenses'].map((item) => (
              <li key={item}>
                <Link to="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {item}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-border/70 flex flex-col md:flex-row justify-between items-center gap-3">
        <div className="text-sm text-muted-foreground text-center md:text-left space-y-1">
          <p>© {new Date().getFullYear()} Presence. All rights reserved.</p>
          <p>
            <span className="font-semibold text-foreground">Powered by RCA</span>
            {' • '}
            Made by <span className="font-semibold text-foreground">Gaurav Raj</span>
            <span className="text-xs"> (Main Developer & Team Leader)</span>
          </p>
        </div>
        <div className="flex space-x-4 mt-4 md:mt-0">
          {['Twitter', 'LinkedIn', 'GitHub'].map((item) => (
            <Link key={item} to="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              {item}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
