import React, { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { UserX, AlertTriangle, Camera, Clock } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import NotificationService from '@/components/admin/NotificationService';
import { backgroundPushService } from '@/services/BackgroundPushService';

interface UnrecognizedFaceAlertProps {
  imageUrl: string;
  timestamp: Date;
  onRetry?: () => void;
  onRegister?: () => void;
}

const UnrecognizedFaceAlert: React.FC<UnrecognizedFaceAlertProps> = ({
  imageUrl,
  timestamp,
  onRetry,
  onRegister
}) => {
  const { toast } = useToast();
  const [showDetails, setShowDetails] = useState(false);
  const [showImage, setShowImage] = useState(false);

  const handleSecurityAlert = () => {
    // Send background push to all admins (works even when their app is closed)
    backgroundPushService.sendStrangerAlert('Main Entrance')
      .then(r => console.log('Stranger push sent:', r))
      .catch(e => console.error('Stranger push error:', e));

    toast({
      title: "Security Alert Triggered",
      description: "Unauthorized access attempt has been logged and security has been notified.",
      variant: "destructive",
    });
  };

  return (
    <>
      <Alert className="border-destructive bg-destructive/10">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <UserX className="h-5 w-5 text-destructive" />
            <span className="font-medium text-destructive">
              Unrecognized Person Detected
            </span>
            <Badge variant="destructive" className="ml-2">
              Access Denied
            </Badge>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImage(true)}
            >
              <Camera className="h-4 w-4 mr-1" />
              View Image
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDetails(true)}
            >
              Details
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center text-destructive">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Unrecognized Access Attempt
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Detection Time:</span>
                <span className="text-sm flex items-center">
                  <Clock className="h-4 w-4 mr-1" />
                  {timestamp.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status:</span>
                <Badge variant="destructive">Unauthorized</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Action Required:</span>
                <span className="text-sm text-muted-foreground">Security Review</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Available Actions:</h4>
              <div className="flex flex-col space-y-2">
                {onRetry && (
                  <Button variant="outline" onClick={onRetry} className="justify-start">
                    <Camera className="h-4 w-4 mr-2" />
                    Try Recognition Again
                  </Button>
                )}
                {onRegister && (
                  <Button variant="outline" onClick={onRegister} className="justify-start">
                    <UserX className="h-4 w-4 mr-2" />
                    Register New Person
                  </Button>
                )}
                <Button variant="destructive" onClick={handleSecurityAlert} className="justify-start">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Trigger Security Alert
                </Button>
              </div>
            </div>

            <div className="bg-destructive/10 p-3 rounded-lg">
              <p className="text-sm text-destructive">
                <strong>Security Notice:</strong> This unauthorized access attempt has been automatically logged. 
                If this is a legitimate person, please register them in the system.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog open={showImage} onOpenChange={setShowImage}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Captured Image - Unrecognized Person</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="relative">
              <img
                src={imageUrl}
                alt="Unrecognized person"
                className="w-full rounded-lg border"
                style={{ maxHeight: '400px', objectFit: 'contain' }}
              />
              <Badge variant="destructive" className="absolute top-2 right-2">
                Unauthorized
              </Badge>
            </div>
            
            <div className="text-sm text-muted-foreground">
              <p>Time: {timestamp.toLocaleString()}</p>
              <p>This image has been securely stored for security review.</p>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setShowImage(false)}>
                Close
              </Button>
              <div className="flex space-x-2">
                {onRetry && (
                  <Button variant="outline" onClick={() => { onRetry(); setShowImage(false); }}>
                    Retry Recognition
                  </Button>
                )}
                {onRegister && (
                  <Button onClick={() => { onRegister(); setShowImage(false); }}>
                    Register Person
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UnrecognizedFaceAlert;