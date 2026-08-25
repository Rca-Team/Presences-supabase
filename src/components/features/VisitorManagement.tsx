import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserPlus, QrCode, Camera, Check, X, Clock, 
  Shield, AlertTriangle, Search, Download, Phone
} from 'lucide-react';
import Webcam from 'react-webcam';
import { QRCodeSVG } from 'qrcode.react';
import * as faceapi from 'face-api.js';

interface Visitor {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  purpose: string;
  status: string;
  badge_code: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  valid_from: string;
  valid_until: string | null;
  created_at: string;
}

const VisitorManagement = () => {
  const { toast } = useToast();
  const webcamRef = useRef<Webcam>(null);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('register');
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    purpose: 'meeting',
  });

  useEffect(() => {
    fetchVisitors();
    
    const channel = supabase
      .channel('visitors-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitors' }, () => {
        fetchVisitors();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchVisitors = async () => {
    try {
      const { data, error } = await supabase
        .from('visitors')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setVisitors(data || []);
    } catch (error) {
      console.error('Error fetching visitors:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateBadgeCode = () => {
    return `VIS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  };

  const capturePhoto = () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      setCapturedPhoto(imageSrc);
      setShowCamera(false);
    }
  };

  const registerVisitor = async () => {
    if (!formData.name || !formData.purpose) {
      toast({ title: 'Error', description: 'Name and purpose are required', variant: 'destructive' });
      return;
    }

    try {
      const badgeCode = generateBadgeCode();
      let photoUrl = null;
      let faceDescriptor = null;

      // Upload photo if captured
      if (capturedPhoto) {
        const base64Data = capturedPhoto.split(',')[1];
        const blob = await fetch(`data:image/jpeg;base64,${base64Data}`).then(r => r.blob());
        const fileName = `visitors/${badgeCode}.jpg`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('face-images')
          .upload(fileName, blob, { contentType: 'image/jpeg' });

        if (!uploadError && uploadData) {
          const { data: urlData } = supabase.storage.from('face-images').getPublicUrl(fileName);
          photoUrl = urlData.publicUrl;

          // Extract face descriptor for recognition
          try {
            const img = await faceapi.fetchImage(capturedPhoto);
            const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
            if (detection) {
              faceDescriptor = Array.from(detection.descriptor);
            }
          } catch (e) {
            console.log('Could not extract face descriptor:', e);
          }
        }
      }

      const { error } = await supabase.from('visitors').insert({
        name: formData.name,
        phone: formData.phone || null,
        email: formData.email || null,
        purpose: formData.purpose,
        photo_url: photoUrl,
        face_descriptor: faceDescriptor,
        badge_code: badgeCode,
        status: 'approved',
        valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Valid for 24 hours
      });

      if (error) throw error;

      toast({ title: 'Visitor Registered', description: `Badge: ${badgeCode}` });
      setFormData({ name: '', phone: '', email: '', purpose: 'meeting' });
      setCapturedPhoto(null);
      setActiveTab('active');
    } catch (error) {
      console.error('Error registering visitor:', error);
      toast({ title: 'Error', description: 'Failed to register visitor', variant: 'destructive' });
    }
  };

  const updateVisitorStatus = async (visitorId: string, status: string) => {
    try {
      const updates: any = { status };
      if (status === 'checked_in') {
        updates.check_in_time = new Date().toISOString();
      } else if (status === 'checked_out') {
        updates.check_out_time = new Date().toISOString();
      }

      const { error } = await supabase
        .from('visitors')
        .update(updates)
        .eq('id', visitorId);

      if (error) throw error;

      toast({ title: 'Status Updated', description: `Visitor ${status.replace('_', ' ')}` });
    } catch (error) {
      console.error('Error updating visitor:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'checked_in': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'checked_out': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      case 'denied': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    }
  };

  const filteredVisitors = visitors.filter(v => 
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.badge_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeVisitors = filteredVisitors.filter(v => v.status === 'checked_in');
  const pendingVisitors = filteredVisitors.filter(v => v.status === 'approved');

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 mb-4">
          <TabsTrigger value="register" className="gap-2">
            <UserPlus className="h-4 w-4" />
            Register
          </TabsTrigger>
          <TabsTrigger value="active" className="gap-2">
            <Shield className="h-4 w-4" />
            Active ({activeVisitors.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <Clock className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="register">
          <Card className="bg-card/50 backdrop-blur border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                Register New Visitor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Full Name *</Label>
                    <Input
                      placeholder="Enter visitor name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Phone Number</Label>
                    <Input
                      placeholder="Enter phone number"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      placeholder="Enter email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Purpose of Visit *</Label>
                    <Select
                      value={formData.purpose}
                      onValueChange={(value) => setFormData({ ...formData, purpose: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="meeting">Meeting</SelectItem>
                        <SelectItem value="parent">Parent Visit</SelectItem>
                        <SelectItem value="delivery">Delivery</SelectItem>
                        <SelectItem value="interview">Interview</SelectItem>
                        <SelectItem value="event">Event</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <Label>Visitor Photo</Label>
                  {showCamera ? (
                    <div className="space-y-2">
                      <Webcam
                        ref={webcamRef}
                        screenshotFormat="image/jpeg"
                        className="rounded-lg w-full"
                        videoConstraints={{ facingMode: 'user' }}
                      />
                      <div className="flex gap-2">
                        <Button onClick={capturePhoto} className="flex-1">
                          <Camera className="mr-2 h-4 w-4" />
                          Capture
                        </Button>
                        <Button variant="outline" onClick={() => setShowCamera(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : capturedPhoto ? (
                    <div className="space-y-2">
                      <img src={capturedPhoto} alt="Captured" className="rounded-lg w-full" />
                      <Button variant="outline" onClick={() => { setCapturedPhoto(null); setShowCamera(true); }}>
                        Retake Photo
                      </Button>
                    </div>
                  ) : (
                    <div 
                      onClick={() => setShowCamera(true)}
                      className="border-2 border-dashed border-primary/30 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    >
                      <Camera className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">Click to capture photo</p>
                    </div>
                  )}
                </div>
              </div>

              <Button onClick={registerVisitor} className="w-full" size="lg">
                <UserPlus className="mr-2 h-5 w-5" />
                Register Visitor & Generate Badge
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active">
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or badge..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pending Check-ins */}
              {pendingVisitors.length > 0 && (
                <Card className="bg-yellow-500/10 border-yellow-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-yellow-400">
                      <AlertTriangle className="h-4 w-4" />
                      Pending Check-in ({pendingVisitors.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-48">
                      {pendingVisitors.map((visitor) => (
                        <div key={visitor.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-background/50 mb-2">
                          <div className="flex items-center gap-2">
                            {visitor.photo_url ? (
                              <img src={visitor.photo_url} alt={visitor.name} className="h-10 w-10 rounded-full object-cover" />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                                {visitor.name.charAt(0)}
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-sm">{visitor.name}</p>
                              <p className="text-xs text-muted-foreground">{visitor.purpose}</p>
                            </div>
                          </div>
                          <Button size="sm" onClick={() => updateVisitorStatus(visitor.id, 'checked_in')}>
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Currently On-Site */}
              <Card className="bg-green-500/10 border-green-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-green-400">
                    <Shield className="h-4 w-4" />
                    Currently On-Site ({activeVisitors.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-48">
                    {activeVisitors.length === 0 ? (
                      <p className="text-center text-muted-foreground py-4">No visitors currently on-site</p>
                    ) : (
                      activeVisitors.map((visitor) => (
                        <div key={visitor.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-background/50 mb-2">
                          <div className="flex items-center gap-2">
                            {visitor.photo_url ? (
                              <img src={visitor.photo_url} alt={visitor.name} className="h-10 w-10 rounded-full object-cover" />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                                {visitor.name.charAt(0)}
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-sm">{visitor.name}</p>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {visitor.check_in_time && new Date(visitor.check_in_time).toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => updateVisitorStatus(visitor.id, 'checked_out')}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card className="bg-card/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-lg">Visitor History</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <AnimatePresence>
                  {filteredVisitors.map((visitor, index) => (
                    <motion.div
                      key={visitor.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 border-b border-border/50"
                    >
                      <div className="flex items-center gap-3">
                        {visitor.photo_url ? (
                          <img src={visitor.photo_url} alt={visitor.name} className="h-12 w-12 rounded-full object-cover" />
                        ) : (
                          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-lg">
                            {visitor.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{visitor.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{visitor.purpose}</span>
                            <span>•</span>
                            <span>{new Date(visitor.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getStatusColor(visitor.status)}>
                          {visitor.status.replace('_', ' ')}
                        </Badge>
                        {visitor.badge_code && (
                          <div className="p-1 bg-white rounded">
                            <QRCodeSVG value={visitor.badge_code} size={40} />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default VisitorManagement;
