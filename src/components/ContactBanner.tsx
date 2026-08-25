
import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';

const ContactBanner = () => {
  return (
    <div className="bg-primary/10 py-2 px-4 w-full text-center">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between">
        <p className="text-sm text-muted-foreground mb-2 sm:mb-0">
          Need assistance or have questions? Get in touch with us.
        </p>
        <Link to="/contact">
          <Button variant="ghost" size="sm" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Contact Us
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default ContactBanner;
