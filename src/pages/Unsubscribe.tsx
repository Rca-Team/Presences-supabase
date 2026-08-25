import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

type State = 'loading' | 'ready' | 'invalid' | 'done' | 'error';

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const validate = async () => {
      if (!token) {
        setState('invalid');
        setMessage('Invalid or missing unsubscribe token.');
        return;
      }

      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
        const url = `${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`;

        const response = await fetch(url, {
          headers: {
            apikey: supabaseAnonKey,
          },
        });

        const data = await response.json();
        if (!response.ok || data?.error) {
          setState('invalid');
          setMessage(data?.error || 'This unsubscribe link is not valid anymore.');
          return;
        }

        if (data?.valid === false && data?.reason === 'already_unsubscribed') {
          setState('done');
          setMessage('You are already unsubscribed.');
          return;
        }

        setState('ready');
      } catch {
        setState('error');
        setMessage('Could not validate the unsubscribe link. Please try again.');
      }
    };

    validate();
  }, [token]);

  const confirmUnsubscribe = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('handle-email-unsubscribe', {
        body: { token },
      });

      if (error) {
        setState('error');
        setMessage(error.message || 'Failed to unsubscribe.');
        return;
      }

      if (data?.success || data?.reason === 'already_unsubscribed') {
        setState('done');
        setMessage(data?.reason === 'already_unsubscribed' ? 'You are already unsubscribed.' : 'You have been unsubscribed successfully.');
      } else {
        setState('error');
        setMessage('Failed to unsubscribe.');
      }
    } catch {
      setState('error');
      setMessage('Failed to unsubscribe. Please try again.');
    }
  };

  return (
    <main className="min-h-screen bg-background neon-liquid-bg flex items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md liquid-glass-surface liquid-glass-highlight">
        <CardHeader>
          <CardTitle>Email Preferences</CardTitle>
          <CardDescription>Manage your app email subscription.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === 'loading' && <Alert><AlertDescription>Validating your link...</AlertDescription></Alert>}

          {(state === 'invalid' || state === 'error' || state === 'done') && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          {state === 'ready' && (
            <>
              <Alert>
                <AlertDescription>Click below to confirm unsubscribe from app emails.</AlertDescription>
              </Alert>
              <Button onClick={confirmUnsubscribe} className="w-full" variant="destructive">
                Confirm Unsubscribe
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
};

export default Unsubscribe;
