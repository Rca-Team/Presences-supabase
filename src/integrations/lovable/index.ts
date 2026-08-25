// Supabase-native OAuth integration (replaces Lovable cloud-auth-js)

import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type OAuthProvider = 'google' | 'github' | 'apple' | 'azure' | 'facebook';

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: OAuthProvider, opts?: SignInOptions) => {
      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: opts?.redirect_uri || window.location.origin,
            queryParams: opts?.extraParams,
          },
        });

        if (error) {
          return { error };
        }

        // signInWithOAuth triggers a redirect, so if we get here with a URL,
        // the browser will navigate away
        if (data?.url) {
          return { redirected: true };
        }

        return data;
      } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
      }
    },
  },
};
