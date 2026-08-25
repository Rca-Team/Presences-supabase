import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: 'default' | 'danger' | 'success' | 'warning';
  isLoading?: boolean;
}

const variantConfig = {
  default: {
    icon: Info,
    iconClass: 'text-primary bg-primary/10',
    buttonClass: 'bg-primary hover:bg-primary/90',
  },
  danger: {
    icon: XCircle,
    iconClass: 'text-destructive bg-destructive/10',
    buttonClass: 'bg-destructive hover:bg-destructive/90',
  },
  success: {
    icon: CheckCircle,
    iconClass: 'text-green-500 bg-green-500/10',
    buttonClass: 'bg-green-500 hover:bg-green-500/90',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-yellow-500 bg-yellow-500/10',
    buttonClass: 'bg-yellow-500 hover:bg-yellow-500/90 text-black',
  },
};

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'default',
  isLoading = false,
}) => {
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            <div className={cn('p-2 rounded-full', config.iconClass)}>
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription className="mt-2">
                {description}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={config.buttonClass}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
