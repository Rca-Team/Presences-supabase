import { useMemo, useState, useEffect, useRef } from 'react';
import { Loader2, Search, Download, Eye, ShieldAlert } from 'lucide-react';
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import PageLayout from '@/components/layouts/PageLayout';
import PageTransition from '@/components/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type FaceModelArtifact = {
  version?: string;
  student_id?: string;
  employee_id?: string;
  capture_mode?: string;
  sample_count?: number;
  descriptor_dimensions?: number;
  descriptor_cloud?: number[][];
  point_cloud_3d_equivalent?: Array<{ id?: number; x?: number; y?: number; z?: number }>;
  [key: string]: unknown;
};

type RegistrationRecord = {
  id: string;
  created_at: string;
  student_id: string | null;
  device_info: {
    metadata?: {
      employee_id?: string;
      face_model?: {
        storage_model_path?: string;
        sample_count?: number;
        capture_mode?: string;
      };
    };
  } | null;
};

type PointCloudPoint = { id: number; x: number; y: number; z: number };

const PointCloud3DViewer = ({ points }: { points: PointCloudPoint[] }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const normalizedPoints = useMemo(() => {
    const validPoints = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
    if (validPoints.length === 0) return [] as PointCloudPoint[];

    const xs = validPoints.map((p) => p.x);
    const ys = validPoints.map((p) => p.y);
    const zs = validPoints.map((p) => p.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
    const scale = 3 / span;

    return validPoints.map((point) => ({
      ...point,
      x: (point.x - centerX) * scale,
      y: (point.y - centerY) * scale,
      z: (point.z - centerZ) * scale,
    }));
  }, [points]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const styles = getComputedStyle(document.documentElement);
    const colorFromToken = (token: string, fallback: string) => {
      const value = styles.getPropertyValue(token).trim();
      return value ? `hsl(${value})` : fallback;
    };

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 320;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(colorFromToken('--background', '#0b1020'));

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    camera.position.set(2.4, 2.2, 2.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(3, 4, 5);
    scene.add(ambient, pointLight);

    const grid = new THREE.GridHelper(8, 8, new THREE.Color(colorFromToken('--border', '#334155')), new THREE.Color(colorFromToken('--accent', '#1e293b')));
    scene.add(grid);
    scene.add(new THREE.AxesHelper(2));

    if (normalizedPoints.length > 0) {
      const positions = new Float32Array(normalizedPoints.length * 3);
      normalizedPoints.forEach((point, index) => {
        const base = index * 3;
        positions[base] = point.x;
        positions[base + 1] = point.y;
        positions[base + 2] = point.z;
      });

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: new THREE.Color(colorFromToken('--primary', '#22d3ee')),
        size: 0.09,
        sizeAttenuation: true,
      });

      const cloud = new THREE.Points(geometry, material);
      scene.add(cloud);
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.target.set(0, 0, 0);
    controls.update();

    let frameId = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const nextWidth = container.clientWidth || 600;
      const nextHeight = container.clientHeight || 320;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      controls.dispose();

      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else if (material) material.dispose();
      });

      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [normalizedPoints]);

  return <div ref={containerRef} className="h-full w-full" aria-label="3D point cloud viewer" />;
};

const FaceModelValidator = () => {
  const { toast } = useToast();
  const { role, isLoading } = useUserRole();
  const [studentId, setStudentId] = useState('');
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<FaceModelArtifact | null>(null);
  const [loadingArtifact, setLoadingArtifact] = useState(false);

  const descriptorScatter = useMemo(() => {
    return (artifact?.descriptor_cloud || []).map((vector, index) => ({
      id: index + 1,
      x: Number(vector?.[0] ?? 0),
      y: Number(vector?.[1] ?? 0),
      z: Number(vector?.[2] ?? 0),
    }));
  }, [artifact]);

  const pointCloudScatter = useMemo(() => {
    return (artifact?.point_cloud_3d_equivalent || []).map((point, index) => ({
      id: point.id ?? index + 1,
      x: Number(point.x ?? 0),
      y: Number(point.y ?? 0),
      z: Number(point.z ?? 0),
    }));
  }, [artifact]);

  const fetchArtifact = async () => {
    const lookupId = studentId.trim();
    if (!lookupId) {
      toast({ title: 'Student ID required', description: 'Please enter a student ID or employee ID.', variant: 'destructive' });
      return;
    }

    try {
      setLoadingArtifact(true);
      setArtifact(null);
      setStoragePath(null);

      const { data, error } = await supabase
        .from('attendance_records')
        .select('id, created_at, student_id, device_info')
        .eq('status', 'registered')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      const records = (data || []) as RegistrationRecord[];
      const matched = records.find((record) => {
        const employeeId = record.device_info?.metadata?.employee_id;
        const currentStudentId = record.student_id;
        const hasPath = !!record.device_info?.metadata?.face_model?.storage_model_path;
        return hasPath && (employeeId === lookupId || currentStudentId === lookupId);
      });
      const modelPath = matched?.device_info?.metadata?.face_model?.storage_model_path;

      if (!modelPath) {
        throw new Error('No stored face model path found for this student.');
      }

      const { data: modelBlob, error: downloadError } = await supabase.storage
        .from('student-registration-faces')
        .download(modelPath);

      if (downloadError || !modelBlob) {
        throw new Error(downloadError?.message || 'Could not download face model artifact.');
      }

      const parsed = JSON.parse(await modelBlob.text()) as FaceModelArtifact;
      setArtifact(parsed);
      setStoragePath(modelPath);

      toast({ title: 'Face model loaded', description: 'Descriptor cloud and 3D-equivalent point cloud are ready.' });
    } catch (err: any) {
      toast({
        title: 'Failed to load model',
        description: err?.message || 'Could not fetch this student face model artifact.',
        variant: 'destructive',
      });
    } finally {
      setLoadingArtifact(false);
    }
  };

  const downloadArtifact = () => {
    if (!artifact) return;
    const content = JSON.stringify(artifact, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${studentId.trim() || 'student'}-face-model.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <PageTransition>
        <PageLayout>
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </PageLayout>
      </PageTransition>
    );
  }

  if (role !== 'admin') {
    return (
      <PageTransition>
        <PageLayout>
          <div className="mx-auto max-w-xl py-10">
            <Alert variant="destructive" className="border-destructive/50">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>This hidden page is admin-only.</AlertDescription>
            </Alert>
          </div>
        </PageLayout>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <PageLayout>
        <div className="mx-auto max-w-6xl space-y-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Face Model Validator</h1>
              <p className="text-sm text-muted-foreground">Hidden tool to inspect stored face-model artifacts by student ID.</p>
            </div>
            <Badge variant="secondary" className="gap-1.5"><Eye className="h-3.5 w-3.5" /> Hidden route</Badge>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Load Student Model Artifact</CardTitle>
              <CardDescription>Fetches the JSON from private storage, then visualizes descriptor cloud and point cloud.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 md:flex-row">
              <Input
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                placeholder="Enter student_id or employee_id"
              />
              <Button onClick={fetchArtifact} disabled={loadingArtifact} className="gap-2 md:w-auto">
                {loadingArtifact ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {loadingArtifact ? 'Loading...' : 'Load Artifact'}
              </Button>
              <Button variant="outline" onClick={downloadArtifact} disabled={!artifact} className="gap-2 md:w-auto">
                <Download className="h-4 w-4" />
                Download JSON
              </Button>
            </CardContent>
          </Card>

          {storagePath ? (
            <Alert>
              <AlertDescription>
                Storage path: <span className="font-mono text-xs">{storagePath}</span>
              </AlertDescription>
            </Alert>
          ) : null}

          {artifact ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader><CardTitle className="text-base">Capture mode</CardTitle></CardHeader>
                  <CardContent className="text-sm">{artifact.capture_mode || 'unknown'}</CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Descriptor cloud samples</CardTitle></CardHeader>
                  <CardContent className="text-sm">{descriptorScatter.length}</CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Point cloud samples</CardTitle></CardHeader>
                  <CardContent className="text-sm">{pointCloudScatter.length}</CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Descriptor Cloud (dims 0/1/2)</CardTitle>
                    <CardDescription>Projection of each descriptor vector to X/Y/Z using first 3 dimensions.</CardDescription>
                  </CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 12, right: 12, left: 8, bottom: 8 }}>
                        <CartesianGrid />
                        <XAxis type="number" dataKey="x" name="x" />
                        <YAxis type="number" dataKey="y" name="y" />
                        <RechartsTooltip formatter={(value, name) => [Number(value).toFixed(6), String(name)]} />
                        <Scatter name="descriptor_cloud" data={descriptorScatter} fill="var(--primary)" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>point_cloud_3d_equivalent</CardTitle>
                    <CardDescription>Stored 3D-equivalent points projected on X/Y with Z in tooltip.</CardDescription>
                  </CardHeader>
                  <CardContent className="h-80 overflow-hidden rounded-md border">
                    <PointCloud3DViewer points={pointCloudScatter} />
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Raw JSON Preview</CardTitle>
                  <CardDescription>Quick validation of the persisted artifact payload structure.</CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-96 overflow-auto rounded-md border bg-muted p-3 text-xs">
                    {JSON.stringify(artifact, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </PageLayout>
    </PageTransition>
  );
};

export default FaceModelValidator;