import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Web Push crypto helpers
async function generatePushHeaders(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
) {
  // For simplicity, we use the web-push compatible approach via fetch to a relay
  // But since Deno doesn't have node crypto compat for web-push, we'll use
  // the simpler approach: send via the Notification API pattern
  return { endpoint, payload };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@presences.dev";

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "principal", "teacher"])
      .maybeSingle();
    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const {
      title,
      body: messageBody,
      data,
      targetUserIds, // optional: array of user_ids. If empty, broadcast to all
      alertType, // optional: emergency type
    } = body;

    // Get push subscriptions
    let query = supabase.from("push_subscriptions").select("*");
    if (targetUserIds && targetUserIds.length > 0) {
      query = query.in("user_id", targetUserIds);
    }

    const { data: subscriptions, error: subError } = await query;
    if (subError) {
      console.error("Error fetching subscriptions:", subError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch subscriptions", details: subError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No subscriptions found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending push to ${subscriptions.length} subscribers`);

    const notificationPayload = JSON.stringify({
      title: title || "Presence Alert",
      body: messageBody || "New update from your school",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: alertType ? `emergency-${alertType}` : "presence-notification",
      renotify: true,
      vibrate: alertType
        ? [1000, 200, 1000, 200, 1000]
        : [200, 100, 200],
      data: {
        url: data?.url || "/",
        alertType: alertType || null,
        emergency: !!alertType,
        ...data,
      },
      requireInteraction: !!alertType,
    });

    // Import web-push compatible library for Deno
    // We'll use the Web Push protocol directly
    const results = await Promise.allSettled(
      subscriptions.map(async (sub: any) => {
        try {
          const pushData = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys_p256dh,
              auth: sub.keys_auth,
            },
          };

          // Use web-push protocol
          const response = await sendWebPush(
            pushData,
            notificationPayload,
            vapidPublicKey,
            vapidPrivateKey,
            vapidSubject
          );

          if (!response.ok) {
            const text = await response.text();
            console.error(`Push failed for ${sub.user_id}: ${response.status} ${text}`);
            
            // Remove expired/invalid subscriptions (410 Gone or 404)
            if (response.status === 410 || response.status === 404) {
              await supabase
                .from("push_subscriptions")
                .delete()
                .eq("id", sub.id);
              console.log(`Removed expired subscription for user ${sub.user_id}`);
            }
            return { success: false, userId: sub.user_id, status: response.status };
          }

          // Consume response body
          await response.text();
          return { success: true, userId: sub.user_id };
        } catch (err) {
          console.error(`Error sending to ${sub.user_id}:`, err);
          return { success: false, userId: sub.user_id, error: String(err) };
        }
      })
    );

    const sent = results.filter(
      (r) => r.status === "fulfilled" && r.value.success
    ).length;
    const failed = results.length - sent;

    // Log the notification
    try {
      await supabase.from("notification_log").insert({
        notification_type: "push",
        message_content: `${title}: ${messageBody}`,
        status: sent > 0 ? "sent" : "failed",
        gateway_response: { sent, failed, total: subscriptions.length },
      });
    } catch (logErr) {
      console.error("Failed to log notification:", logErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        failed,
        total: subscriptions.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send push error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ---- Web Push Protocol Implementation ----

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function uint8ArrayToBase64Url(arr: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string
): Promise<Response> {
  const endpoint = new URL(subscription.endpoint);
  const audience = `${endpoint.protocol}//${endpoint.host}`;

  // Create VAPID JWT
  const jwt = await createVapidJwt(audience, vapidSubject, vapidPrivateKey);
  const vapidPublicKeyBytes = base64UrlToUint8Array(vapidPublicKey);

  // Encrypt payload using Web Push encryption (RFC 8291)
  const encrypted = await encryptPayload(
    subscription.keys.p256dh,
    subscription.keys.auth,
    new TextEncoder().encode(payload)
  );

  const headers: Record<string, string> = {
    Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: "86400",
    Urgency: "high",
  };

  return fetch(subscription.endpoint, {
    method: "POST",
    headers,
    body: encrypted,
  });
}

async function createVapidJwt(
  audience: string,
  subject: string,
  privateKeyBase64Url: string
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: audience,
    exp: now + 12 * 3600,
    sub: subject,
  };

  const headerB64 = uint8ArrayToBase64Url(
    new TextEncoder().encode(JSON.stringify(header))
  );
  const claimsB64 = uint8ArrayToBase64Url(
    new TextEncoder().encode(JSON.stringify(claims))
  );
  const unsignedToken = `${headerB64}.${claimsB64}`;

  // Import private key using JWK format (more reliable than PKCS8 wrapping)
  const privateKeyBytes = base64UrlToUint8Array(privateKeyBase64Url);
  
  // We need the public key to build a proper JWK
  // Extract x and y from the uncompressed public key (skip 0x04 prefix)
  const vapidPubKeyEnv = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const pubKeyBytes = base64UrlToUint8Array(vapidPubKeyEnv);
  const x = uint8ArrayToBase64Url(pubKeyBytes.slice(1, 33));
  const y = uint8ArrayToBase64Url(pubKeyBytes.slice(33, 65));
  const d = privateKeyBase64Url;

  const jwk = { kty: "EC", crv: "P-256", x, y, d };

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw r||s format
  const rawSig = derToRaw(new Uint8Array(signature));
  const sigB64 = uint8ArrayToBase64Url(rawSig);

  return `${unsignedToken}.${sigB64}`;
}

function buildPkcs8FromRaw(rawKey: Uint8Array): ArrayBuffer {
  // PKCS8 wrapper for EC P-256 private key
  const pkcs8Header = new Uint8Array([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86,
    0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);
  // The raw key should be 32 bytes
  const result = new Uint8Array(pkcs8Header.length + rawKey.length);
  result.set(pkcs8Header);
  result.set(rawKey, pkcs8Header.length);
  return result.buffer;
}

function derToRaw(der: Uint8Array): Uint8Array {
  // If it's already 64 bytes, assume raw format
  if (der.length === 64) return der;
  
  // Parse DER SEQUENCE
  const raw = new Uint8Array(64);
  let offset = 2; // Skip SEQUENCE tag and length
  
  // Read r
  if (der[offset] !== 0x02) return der; // Not INTEGER
  offset++;
  let rLen = der[offset]; offset++;
  let rOffset = offset;
  if (rLen === 33 && der[rOffset] === 0) { rOffset++; rLen = 32; }
  if (rLen < 32) {
    raw.set(der.subarray(rOffset, rOffset + rLen), 32 - rLen);
  } else {
    raw.set(der.subarray(rOffset, rOffset + 32), 0);
  }
  offset = rOffset + (rLen === 32 ? 32 : rLen);
  
  // Read s
  if (der[offset] !== 0x02) return der;
  offset++;
  let sLen = der[offset]; offset++;
  let sOffset = offset;
  if (sLen === 33 && der[sOffset] === 0) { sOffset++; sLen = 32; }
  if (sLen < 32) {
    raw.set(der.subarray(sOffset, sOffset + sLen), 64 - sLen);
  } else {
    raw.set(der.subarray(sOffset, sOffset + 32), 32);
  }
  
  return raw;
}

async function encryptPayload(
  p256dhBase64: string,
  authBase64: string,
  payload: Uint8Array
): Promise<Uint8Array> {
  const clientPublicKey = base64UrlToUint8Array(p256dhBase64);
  const clientAuth = base64UrlToUint8Array(authBase64);

  // Generate local ephemeral key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // Export local public key
  const localPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKeyPair.publicKey)
  );

  // Import client's public key
  const clientCryptoKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientCryptoKey },
      localKeyPair.privateKey,
      256
    )
  );

  // HKDF for auth secret  
  const authInfo = concatUint8Arrays(
    new TextEncoder().encode("WebPush: info\0"),
    clientPublicKey,
    localPublicKeyRaw
  );
  
  const ikmKey = await crypto.subtle.importKey(
    "raw", clientAuth, { name: "HKDF" }, false, ["deriveBits"]
  );
  
  // PRK = HKDF-Extract(auth_secret, ecdh_secret)
  const prkKey = await crypto.subtle.importKey(
    "raw", sharedSecret, "HKDF", false, ["deriveBits"]
  );

  // Use HKDF with the shared secret
  const ikm = await hkdfExtractExpand(clientAuth, sharedSecret, authInfo, 32);

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Content encryption key info
  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const contentKey = await hkdfExtractExpand(salt, ikm, cekInfo, 16);

  // Nonce info
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
  const nonce = await hkdfExtractExpand(salt, ikm, nonceInfo, 12);

  // Pad payload (add delimiter byte 0x02)
  const paddedPayload = new Uint8Array(payload.length + 1);
  paddedPayload.set(payload);
  paddedPayload[payload.length] = 2; // padding delimiter

  // AES-128-GCM encrypt
  const aesKey = await crypto.subtle.importKey(
    "raw", contentKey, { name: "AES-GCM" }, false, ["encrypt"]
  );

  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aesKey,
      paddedPayload
    )
  );

  // Build aes128gcm header: salt (16) + rs (4) + keyidlen (1) + keyid (65) + ciphertext
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, paddedPayload.length + 16 + 1); // +16 for tag, +1 for padding

  const header = concatUint8Arrays(
    salt,
    recordSize,
    new Uint8Array([localPublicKeyRaw.length]),
    localPublicKeyRaw
  );

  return concatUint8Arrays(header, encrypted);
}

async function hkdfExtractExpand(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveBits",
  ]);

  const derived = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8
  );

  return new Uint8Array(derived);
}

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
