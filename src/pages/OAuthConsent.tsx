import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type OAuthApi = {
  getAuthorizationDetails: (authorizationId: string) => Promise<{ data?: any; error?: { message?: string } | null }>;
  approveAuthorization: (authorizationId: string) => Promise<{ data?: any; error?: { message?: string } | null }>;
  denyAuthorization: (authorizationId: string) => Promise<{ data?: any; error?: { message?: string } | null }>;
};

const oauthApi = ((supabase.auth as any).oauth || null) as OAuthApi | null;

const isSafeNextPath = (value: string | null) => {
  if (!value) return false;
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false;
  return true;
};

const OAuthConsent = () => {
  const [searchParams] = useSearchParams();
  const authorizationId = searchParams.get('authorization_id') || '';

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<any>(null);

  const preserveCurrentPath = useMemo(() => `${window.location.pathname}${window.location.search}`,
    []);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!oauthApi) {
        setError('OAuth consent APIs are unavailable in this build.');
        setLoading(false);
        return;
      }

      if (!authorizationId) {
        setError('Missing authorization_id in URL.');
        setLoading(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        window.location.href = `/login?redirectTo=${encodeURIComponent(preserveCurrentPath)}`;
        return;
      }

      const res = await oauthApi.getAuthorizationDetails(authorizationId);
      if (!active) return;

      if (res.error) {
        setError(res.error.message || 'Failed to load authorization details.');
        setLoading(false);
        return;
      }

      const immediate = res.data?.redirect_url || res.data?.redirect_to;
      if (immediate && !res.data?.client) {
        window.location.href = immediate;
        return;
      }

      setDetails(res.data || null);
      setLoading(false);
    };

    run();

    return () => {
      active = false;
    };
  }, [authorizationId, preserveCurrentPath]);

  const decide = async (approve: boolean) => {
    if (!oauthApi) return;
    setBusy(true);
    setError(null);

    const res = approve
      ? await oauthApi.approveAuthorization(authorizationId)
      : await oauthApi.denyAuthorization(authorizationId);

    if (res.error) {
      setError(res.error.message || 'Authorization action failed.');
      setBusy(false);
      return;
    }

    const redirectTo = res.data?.redirect_url || res.data?.redirect_to;
    if (!redirectTo) {
      setError('No redirect URL returned by authorization server.');
      setBusy(false);
      return;
    }

    window.location.href = redirectTo;
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>Loading authorization request…</CardTitle>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>OAuth consent error</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Connect {details?.client?.name || 'this app'} to your Presences account?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Approving allows this client to use Presences MCP tools as your signed-in account.
          </p>

          {Array.isArray(details?.scopes) && details.scopes.length > 0 && (
            <div className="text-sm">
              <p className="font-medium mb-2">Requested access:</p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                {details.scopes.map((scope: string) => (
                  <li key={scope}>{scope}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
            <Button variant="outline" disabled={busy} onClick={() => decide(false)}>
              Deny
            </Button>
            <Button disabled={busy} onClick={() => decide(true)}>
              Approve
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
};

export default OAuthConsent;
