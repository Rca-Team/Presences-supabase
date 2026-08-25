import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Upload, FileDown, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const HEADER_MAP: Record<string, string> = {
  'name of student': 'name',
  'student name': 'name',
  name: 'name',
  email: 'email',
  'parent email': 'email',
  emailphone: 'email',
  phone: 'phone',
  'phone number': 'phone',
  'parent phone': 'phone',
  'parent name': 'parent_name',
  'father name': 'parent_name',
  roll: 'roll_number',
  'roll number': 'roll_number',
  'admission number': 'admission_number',
  class: 'class',
  section: 'section',
};

const ParentContactImporter: React.FC<{ onImported?: () => void }> = ({ onImported }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['NAME OF STUDENT', 'EMAIL', 'PHONE NUMBER', 'PARENT NAME', 'CLASS', 'SECTION'],
      ['Aarav Sharma', 'rajesh@example.com', '9876543210', 'Rajesh Sharma', '8', 'A'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Parents');
    XLSX.writeFile(wb, 'parent-contacts-template.xlsx');
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setSummary(null);
    setResults([]);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

      const rows = raw
        .map((r) => {
          const out: Record<string, string> = {};
          Object.entries(r).forEach(([k, v]) => {
            const key = HEADER_MAP[String(k).trim().toLowerCase()];
            if (key) out[key] = String(v ?? '').trim();
          });
          return out;
        })
        .filter((r) => Object.values(r).some((v) => v));

      if (rows.length === 0) {
        toast({ title: 'Nothing to import', description: 'No recognisable columns found.', variant: 'destructive' });
        return;
      }

      const { data, error } = await supabase.functions.invoke('import-parent-contacts', { body: { rows } });
      if (error) throw error;

      setSummary(data?.summary);
      setResults(data?.results || []);
      toast({
        title: 'Parent contacts imported',
        description: `${data?.summary?.updated || 0} updated · ${data?.summary?.notFound || 0} unmatched · ${data?.summary?.invalid || 0} invalid`,
      });
      onImported?.();
    } catch (err: any) {
      toast({ title: 'Import failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Upload className="h-4 w-4" /> Import parent emails (Excel)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import parent contact sheet</DialogTitle>
          <DialogDescription>
            Match students and securely update parent email and phone details from a spreadsheet.
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Upload an .xlsx or .csv with columns: <strong>NAME OF STUDENT, EMAIL, PHONE NUMBER, PARENT NAME</strong>.
          Matching students get their parent email and phone saved, so attendance emails send automatically.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={downloadTemplate} className="gap-2">
            <FileDown className="h-4 w-4" /> Download template
          </Button>
          <Button asChild size="sm" disabled={busy} className="gap-2">
            <label className="cursor-pointer">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy ? 'Importing…' : 'Choose file'}
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} disabled={busy} />
            </label>
          </Button>
        </div>

        {summary && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> {summary.updated} updated</Badge>
            <Badge variant="secondary">{summary.notFound} unmatched</Badge>
            <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> {summary.invalid} invalid</Badge>
          </div>
        )}

        {results.length > 0 && (
          <div className="max-h-48 overflow-auto rounded-md border text-xs">
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between border-b px-3 py-1.5 last:border-0">
                <span className="truncate">{r.name || '—'}</span>
                <span className={r.status === 'updated' ? 'text-green-600' : 'text-muted-foreground'}>
                  {r.status}{r.message ? ` · ${r.message}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ParentContactImporter;
