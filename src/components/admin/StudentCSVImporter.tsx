import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, FileDown, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const SAMPLE = `roll_number,name,class,section,parent_name,parent_phone,parent_email
101,Aarav Sharma,8,A,Rajesh Sharma,9876543210,rajesh@example.com
102,Priya Patel,8,A,Anita Patel,9876500000,anita@example.com
`;

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cols[i] ?? ''));
    return row;
  });
}

const StudentCSVImporter: React.FC<{ onImported?: () => void }> = ({ onImported }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setResults([]); setSummary(null);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast({ title: 'Empty CSV', description: 'No rows found', variant: 'destructive' });
        setBusy(false); return;
      }
      const { data, error } = await supabase.functions.invoke('bulk-create-students', { body: { rows } });
      if (error) throw error;
      setSummary(data?.summary); setResults(data?.results || []);
      toast({
        title: 'Import complete',
        description: `${data?.summary?.created || 0} created, ${data?.summary?.skipped || 0} skipped, ${data?.summary?.errors || 0} errors`,
      });
      onImported?.();
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'students-sample.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Upload className="h-4 w-4" /> Upload CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Bulk-register students from CSV</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium mb-1">Required columns</p>
            <code className="text-xs">roll_number, name, class, section, parent_name, parent_phone, parent_email</code>
            <p className="text-xs text-muted-foreground mt-2">Face capture is done later from each student's row.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadSample}>
              <FileDown className="h-4 w-4 mr-1" /> Sample CSV
            </Button>
            <label className="inline-flex">
              <input type="file" accept=".csv,text/csv" onChange={handleFile} disabled={busy} className="hidden" />
              <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer ${busy ? 'opacity-50 pointer-events-none bg-muted' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {busy ? 'Importing…' : 'Choose CSV'}
              </span>
            </label>
          </div>
          {summary && (
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-2">
                <div className="text-xl font-bold text-emerald-600">{summary.created}</div>
                <div className="text-xs text-muted-foreground">Created</div>
              </div>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-2">
                <div className="text-xl font-bold text-amber-600">{summary.skipped}</div>
                <div className="text-xs text-muted-foreground">Skipped</div>
              </div>
              <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 p-2">
                <div className="text-xl font-bold text-rose-600">{summary.errors}</div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </div>
            </div>
          )}
          {results.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-lg border">
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs border-b last:border-0">
                  {r.status === 'created' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                  <span className="font-medium">{r.roll_number}</span>
                  <span className="text-muted-foreground truncate flex-1">{r.name}</span>
                  <span className={r.status === 'created' ? 'text-emerald-600' : r.status === 'skipped' ? 'text-amber-600' : 'text-rose-600'}>
                    {r.status}{r.message ? ` — ${r.message}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StudentCSVImporter;