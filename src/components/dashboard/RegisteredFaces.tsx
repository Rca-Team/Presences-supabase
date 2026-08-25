
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Trash2, X, Check, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface RegisteredFace {
  id: string;
  name: string;
  employee_id: string;
  department: string;
  position: string;
  image_url: string;
  record_id: string;
}

interface RegisteredFacesProps {
  isLoading: boolean;
  faces?: RegisteredFace[];
  refetchFaces: () => void;
}

const RegisteredFaces: React.FC<RegisteredFacesProps> = ({ 
  isLoading, 
  faces, 
  refetchFaces 
}) => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [editingFace, setEditingFace] = useState<string | null>(null);
  const [faceData, setFaceData] = useState<Record<string, any>>({});

  // Set up real-time subscription for registered faces
  React.useEffect(() => {
    const channel = supabase
      .channel('registered_faces_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'attendance_records',
        filter: 'device_info->registration=eq.true'
      }, () => {
        refetchFaces();
      })
      .subscribe();

    // Set up interval for periodic updates
    const interval = setInterval(() => {
      refetchFaces();
    }, 5000); // Update every 5 seconds

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [refetchFaces]);
  
  // Filter faces based on search term
  const filteredFaces = faces?.filter(face => 
    face.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    face.employee_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    face.department.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Handle edit of face data
  const handleEditFace = (id: string) => {
    const face = faces?.find(f => f.id === id);
    if (face) {
      setFaceData({
        name: face.name,
        employee_id: face.employee_id,
        department: face.department,
        position: face.position,
      });
      setEditingFace(id);
    }
  };
  
  // Handle saving edited face data
  const handleSaveFace = async (id: string) => {
    try {
      // Find the original record
      const record = faces?.find(f => f.id === id);
      if (!record) return;
      
      // Get the original device_info
      const { data: originalRecord, error: fetchError } = await supabase
        .from('attendance_records')
        .select('device_info')
        .eq('id', id)
        .single();
        
      if (fetchError) throw fetchError;
      
      // Update the device_info metadata with new values
      const deviceInfo = originalRecord.device_info as any;
      deviceInfo.metadata = {
        ...deviceInfo.metadata,
        name: faceData.name || deviceInfo.metadata?.name,
        employee_id: faceData.employee_id || deviceInfo.metadata?.employee_id,
        department: faceData.department || deviceInfo.metadata?.department, 
        position: faceData.position || deviceInfo.metadata?.position
      };
      
      // Update the record
      const { error: updateError } = await supabase
        .from('attendance_records')
        .update({
          device_info: deviceInfo
        })
        .eq('id', id);
        
      if (updateError) throw updateError;
      
      toast({
        title: "Success",
        description: "Face data updated successfully",
        variant: "default"
      });
      
      // Reset editing state and refetch faces
      setEditingFace(null);
      refetchFaces();
    } catch (error) {
      console.error('Error saving face data:', error);
      toast({
        title: "Error",
        description: "Failed to update face data",
        variant: "destructive"
      });
    }
  };
  
  // Handle delete face
  const handleDeleteFace = async (id: string) => {
    if (!confirm("Are you sure you want to delete this face data?")) return;
    
    try {
      const { error } = await supabase
        .from('attendance_records')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Face data deleted successfully",
        variant: "default"
      });
      
      refetchFaces();
    } catch (error) {
      console.error('Error deleting face data:', error);
      toast({
        title: "Error",
        description: "Failed to delete face data",
        variant: "destructive"
      });
    }
  };

  return (
    <Card className="p-6 animate-slide-in-up mb-8" style={{ animationDelay: '500ms' }}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">Registered Faces</h3>
        <div className="relative w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or ID..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : filteredFaces && filteredFaces.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 font-medium">Photo</th>
                <th className="text-left py-2 px-2 font-medium">Name</th>
                <th className="text-left py-2 px-2 font-medium">Student ID</th>
                <th className="text-left py-2 px-2 font-medium">Department</th>
                <th className="text-left py-2 px-2 font-medium">Position</th>
                <th className="text-right py-2 px-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFaces.map((face) => (
                <tr key={face.id} className="border-b hover:bg-muted/50">
                  <td className="py-3 px-2">
                    <Avatar className="w-10 h-10">
                      <AvatarImage 
                        src={face.image_url} 
                        alt={face.name}
                      />
                      <AvatarFallback>
                        <span className="text-primary font-medium">{face.name.charAt(0)}</span>
                      </AvatarFallback>
                    </Avatar>
                  </td>
                  <td className="py-3 px-2">
                    {editingFace === face.id ? (
                      <Input 
                        value={faceData.name || ''} 
                        onChange={(e) => setFaceData({...faceData, name: e.target.value})}
                        className="max-w-40"
                      />
                    ) : (
                      face.name
                    )}
                  </td>
                  <td className="py-3 px-2">
                    {editingFace === face.id ? (
                      <Input 
                        value={faceData.employee_id || ''} 
                        onChange={(e) => setFaceData({...faceData, employee_id: e.target.value})}
                        className="max-w-32"
                      />
                    ) : (
                      face.employee_id
                    )}
                  </td>
                  <td className="py-3 px-2">
                    {editingFace === face.id ? (
                      <Input 
                        value={faceData.department || ''} 
                        onChange={(e) => setFaceData({...faceData, department: e.target.value})}
                        className="max-w-32"
                      />
                    ) : (
                      face.department
                    )}
                  </td>
                  <td className="py-3 px-2">
                    {editingFace === face.id ? (
                      <Input 
                        value={faceData.position || ''} 
                        onChange={(e) => setFaceData({...faceData, position: e.target.value})}
                        className="max-w-32"
                      />
                    ) : (
                      face.position
                    )}
                  </td>
                  <td className="py-3 px-2 text-right">
                    {editingFace === face.id ? (
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleSaveFace(face.id)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => setEditingFace(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleEditFace(face.id)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDeleteFace(face.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-8 text-center">
          <p className="text-muted-foreground">No registered faces found</p>
          <Link to="/register">
            <Button className="mt-4">Register New Face</Button>
          </Link>
        </div>
      )}
    </Card>
  );
};

export default RegisteredFaces;
