import React from 'react';
import { Link } from 'react-router-dom';
import Logo from './Logo';
import { 
  SCHOOL_NAME, 
  SCHOOL_AFFILIATION, 
  SCHOOL_ADDRESS, 
  PRINCIPAL_NAME, 
  PRINCIPAL_TITLE, 
  KVS_LOGO_URL 
} from '@/constants/schoolConfig';
import { Building2, ShieldCheck, Award } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="py-12 px-4 sm:px-6 md:px-8 border-t border-border/70 bg-transparent">
      {/* Official School Partnership Banner */}
      <div className="max-w-7xl mx-auto mb-10 p-5 sm:p-6 rounded-3xl nano-glass border border-amber-400/20 bg-gradient-to-r from-amber-500/5 via-primary/5 to-purple-500/5 backdrop-blur-xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-5 text-center md:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <img 
              src={KVS_LOGO_URL} 
              alt="KVS Emblem" 
              className="h-16 w-16 object-contain rounded-2xl bg-white p-1 shadow-md border border-amber-400/40 shrink-0" 
            />
            <div>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                <span className="text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30">
                  Official Smart Campus Partner
                </span>
                <span className="text-xs font-semibold text-muted-foreground">
                  Kendriya Vidyalaya Sangathan
                </span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-foreground mt-1">
                {SCHOOL_NAME}
              </h3>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                {SCHOOL_AFFILIATION}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center md:items-end shrink-0 border-t md:border-t-0 md:border-l border-border/50 pt-3 md:pt-0 md:pl-6">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Award className="h-4 w-4 text-amber-500" />
              <span>Head of Institution:</span>
            </div>
            <p className="text-sm font-black text-primary">
              {PRINCIPAL_NAME}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {PRINCIPAL_TITLE}, PM Shri KV NFC Vigyan Vihar
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="space-y-4 liquid-glass-surface liquid-glass-highlight p-5">
          <Logo />
          <p className="text-sm text-muted-foreground max-w-xs">
            Official Smart School AI automation platform deployed at PM Shri Kendriya Vidyalaya NFC Vigyan Vihar.
          </p>
          <p className="text-xs text-muted-foreground">
            {SCHOOL_ADDRESS}
          </p>
        </div>
        
        <div className="liquid-glass-surface liquid-glass-highlight p-5">
          <h4 className="font-medium text-sm mb-4">Product</h4>
          <ul className="space-y-2">
            {[
              { label: 'Attendance System', path: '/attendance' },
              { label: 'Gate Security Mode', path: '/gate' },
              { label: 'Parent Portal', path: '/parent' },
              { label: 'Features & Architecture', path: '/features' },
            ].map((item) => (
              <li key={item.label}>
                <Link to={item.path} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="liquid-glass-surface liquid-glass-highlight p-5">
          <h4 className="font-medium text-sm mb-4">Institutional Portal</h4>
          <ul className="space-y-2">
            {[
              { label: 'Principal Dashboard', path: '/admin' },
              { label: 'Teacher Portal', path: '/teacher' },
              { label: 'RCA Studio & Team', path: '/portfolio' },
              { label: 'Contact School Desk', path: '/contact' },
            ].map((item) => (
              <li key={item.label}>
                <Link to={item.path} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="liquid-glass-surface liquid-glass-highlight p-5">
          <h4 className="font-medium text-sm mb-4">Security &amp; Compliance</h4>
          <ul className="space-y-2">
            {[
              'Facial Vector Privacy (No Raw Faces)',
              'AES-256 On-Device Tokenization',
              'KVS Digital Guidelines Compliant',
              'Real-Time Push Notification Engine',
            ].map((item) => (
              <li key={item} className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto mt-10 pt-6 border-t border-border/70 flex flex-col md:flex-row justify-between items-center gap-3">
        <div className="text-sm text-muted-foreground text-center md:text-left space-y-1">
          <p>© {new Date().getFullYear()} Presences AI. Official System for {SCHOOL_NAME}.</p>
          <p>
            <span className="font-semibold text-foreground">Powered by RCA</span>
            {' • '}
            Architected &amp; Built by <span className="font-semibold text-foreground">Gaurav Raj</span>
            <span className="text-xs"> (Lead Architect &amp; Developer)</span> with Team RCA
          </p>
        </div>
        <div className="flex space-x-4 mt-4 md:mt-0">
          <Link to="/portfolio" className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline">
            RCA Portfolio &amp; Creators Studio →
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

