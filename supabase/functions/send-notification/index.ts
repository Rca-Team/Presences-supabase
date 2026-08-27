import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buildAttendanceEmail, hostSnapshot, resolveStudentPhotoUrl } from "../_shared/attendance-email.ts";

const resendApiKey = Deno.env.get("RESEND_API_KEY");
const googleMailApiKey = Deno.env.get("GOOGLE_MAIL_API_KEY");
const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

const whatsappAccessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
const whatsappPhoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

const sms77RapidApiKey = Deno.env.get("SMS77_RAPIDAPI_KEY");

const cronSecret = Deno.env.get("CRON_SECRET");

const fallbackEmail = Deno.env.get("NOTIFY_FALLBACK_EMAIL");

const FROM_ADDRESS = Deno.env.get("RESEND_FROM") || "PM Shri KV NFC Vigyan Vihar <noreply@presences.dev>";

function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;

  let clean = String(phone).replace(/[\s\-()]/g, "");

  if (clean.startsWith("+")) {
    clean = clean.slice(1);
  }

  // India 10-digit number
  if (/^\d{10}$/.test(clean)) {
    clean = `91${clean}`;
  }

  return /^\d{10,15}$/.test(clean) ? clean : null;
}

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[A-Za-z]{2,}$/;

function normalizeEmail(email?: string | null): string | null {
  if (!email || typeof email !== "string") return null;

  let clean = email.trim();

  const angle = clean.match(/<([^>]+)>/);

  if (angle) {
    clean = angle[1].trim();
  }

  clean = clean.replace(/^mailto:/i, "").toLowerCase();

  return EMAIL_RE.test(clean) ? clean : null;
}

/* -------------------------------------------------------
   EMAIL
------------------------------------------------------- */

async function sendEmail(to: string, subject: string, html: string) {
  let lastEmailError: string | null = null;
  const recipient = normalizeEmail(to);

  if (!recipient) {
    return {
      ok: false,
      error: "Invalid recipient email",
    };
  }

  /*
   * 1. Resend — direct (re_ key) or through the Lovable connector gateway.
   */
  if (resendApiKey) {
    const direct = resendApiKey.startsWith("re_");
    const url = direct
      ? "https://api.resend.com/emails"
      : "https://connector-gateway.lovable.dev/resend/emails";
    const headers: Record<string, string> = direct
      ? { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" }
      : {
          Authorization: `Bearer ${lovableApiKey}`,
          "X-Connection-Api-Key": resendApiKey,
          "Content-Type": "application/json",
        };

    if (direct || lovableApiKey) {
      const fromCandidates = [FROM_ADDRESS, "PM Shri KV NFC Vigyan Vihar <onboarding@resend.dev>"];

      for (const from of fromCandidates) {
        try {
          const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
              from,
              to: [recipient],
              subject: subject || "School Notification",
              html: html || "<p>School notification</p>",
            }),
          });

          const data = await response.json().catch(() => ({}));

          if (response.ok) {
            return { ok: true, id: data?.id || null };
          }

          console.error(`Resend error [${response.status}] from=${from}:`, JSON.stringify(data));
          lastEmailError = data?.message || data?.error || `Resend failed (${response.status})`;
        } catch (error) {
          console.error("Resend exception:", error);
          lastEmailError = error instanceof Error ? error.message : "Resend request failed";
        }
      }
    }
  }


  /*
   * 2. Gmail through Lovable connector
   */
  if (lovableApiKey && googleMailApiKey) {
    try {
      const rawEmail = [
        `To: ${recipient}`,
        `Subject: ${subject || "School Notification"}`,
        "MIME-Version: 1.0",
        'Content-Type: text/html; charset="UTF-8"',
        "",
        html || "<p>School notification</p>",
      ].join("\r\n");

      const bytes = new TextEncoder().encode(rawEmail);

      let binary = "";

      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }

      const encodedRaw = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      const response = await fetch(
        "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "X-Connection-Api-Key": googleMailApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            raw: encodedRaw,
          }),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        return {
          ok: true,
          id: data?.id || null,
        };
      }

      console.error("Gmail error:", data);
    } catch (error) {
      console.error("Gmail exception:", error);
    }
  }

  return {
    ok: false,
    error: lastEmailError || "No email provider is configured",
  };

}

/* -------------------------------------------------------
   WHATSAPP
------------------------------------------------------- */

async function sendWhatsApp(phone: string, message: string) {
  if (!whatsappAccessToken || !whatsappPhoneNumberId) {
    return {
      success: false,
      error: "WhatsApp is not configured",
    };
  }

  const formattedPhone = normalizePhone(phone);

  if (!formattedPhone) {
    return {
      success: false,
      error: "Invalid WhatsApp phone number",
    };
  }

  try {
    const url = `https://graph.facebook.com/v25.0/${whatsappPhoneNumberId}/messages`;

    /*
     * Try normal text message first.
     */
    const textResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${whatsappAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "text",
        text: {
          body: message,
        },
      }),
    });

    const textData = await textResponse.json().catch(() => ({}));

    if (textResponse.ok) {
      return {
        success: true,
        messageId: textData?.messages?.[0]?.id || null,
      };
    }

    /*
     * Template fallback.
     */
    const templateResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${whatsappAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "template",
        template: {
          name: "hello_world",
          language: {
            code: "en_US",
          },
        },
      }),
    });

    const templateData = await templateResponse.json().catch(() => ({}));

    if (templateResponse.ok) {
      return {
        success: true,
        messageId: templateData?.messages?.[0]?.id || null,
      };
    }

    return {
      success: false,
      error: textData?.error?.message || templateData?.error?.message || "WhatsApp delivery failed",
    };
  } catch (error) {
    console.error("WhatsApp exception:", error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "WhatsApp request failed",
    };
  }
}

/* -------------------------------------------------------
   SMS
------------------------------------------------------- */

async function sendSMS(phone: string, message: string) {
  const formattedPhone = normalizePhone(phone);

  if (!formattedPhone) {
    return {
      success: false,
      provider: null,
      error: "Invalid phone number",
    };
  }

  /*
   * SMS77 through RapidAPI
   */
  if (sms77RapidApiKey) {
    try {
      const response = await fetch("https://sms77io.p.rapidapi.com/sms", {
        method: "POST",
        headers: {
          "x-rapidapi-key": sms77RapidApiKey,
          "x-rapidapi-host": "sms77io.p.rapidapi.com",
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          to: formattedPhone,
          text: message,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data?.success !== false && !data?.error) {
        return {
          success: true,
          provider: "sms77",
          messageId: data?.id || data?.msg_id || data?.message_id || null,
        };
      }

      return {
        success: false,
        provider: "sms77",
        error: data?.error?.message || data?.message || "SMS77 failed",
      };
    } catch (error) {
      return {
        success: false,
        provider: "sms77",
        error: error instanceof Error ? error.message : "SMS77 request failed",
      };
    }
  }

  /*
   * Textbelt fallback
   */
  try {
    const response = await fetch("https://textbelt.com/text", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        phone: `+${formattedPhone}`,
        message,
        key: "textbelt",
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && data?.success) {
      return {
        success: true,
        provider: "textbelt",
        messageId: data?.textId || null,
      };
    }

    return {
      success: false,
      provider: "textbelt",
      error: data?.error || "SMS delivery failed",
    };
  } catch (error) {
    return {
      success: false,
      provider: "textbelt",
      error: error instanceof Error ? error.message : "SMS request failed",
    };
  }
}

/* -------------------------------------------------------
   PAYLOAD
------------------------------------------------------- */

function normalizePayload(raw: any) {
  const student =
    raw?.student && typeof raw.student === "object"
      ? {
          id: typeof raw.student.id === "string" ? raw.student.id : undefined,

          name: typeof raw.student.name === "string" ? raw.student.name : undefined,

          status: typeof raw.student.status === "string" ? raw.student.status : undefined,
        }
      : {
          id: typeof raw?.studentId === "string" ? raw.studentId : undefined,

          name: typeof raw?.studentName === "string" ? raw.studentName : undefined,

          status: typeof raw?.status === "string" ? raw.status : "notification",
        };

  const recipientObject = typeof raw?.recipient === "object" && raw?.recipient !== null ? raw.recipient : null;

  const recipientEmail =
    typeof raw?.recipient === "string"
      ? raw.recipient
      : typeof recipientObject?.email === "string"
        ? recipientObject.email
        : undefined;

  const recipientPhone =
    typeof recipientObject?.phone === "string"
      ? recipientObject.phone
      : typeof raw?.phoneNumber === "string"
        ? raw.phoneNumber
        : undefined;

  const recipientName =
    typeof recipientObject?.name === "string"
      ? recipientObject.name
      : typeof raw?.parentName === "string"
        ? raw.parentName
        : undefined;

  const messageObject = typeof raw?.message === "object" && raw?.message !== null ? raw.message : null;

  const subject =
    typeof raw?.subject === "string"
      ? raw.subject
      : typeof messageObject?.subject === "string"
        ? messageObject.subject
        : `School Notification${student.name ? ` - ${student.name}` : ""}`;

  const body =
    typeof raw?.message === "string" ? raw.message : typeof messageObject?.body === "string" ? messageObject.body : "";

  return {
    student,

    recipient: {
      email: recipientEmail,
      name: recipientName,
      phone: recipientPhone,
    },

    subject,
    body,

    targetUserId: typeof raw?.targetUserId === "string" ? raw.targetUserId : undefined,

    photoUrl:
      typeof raw?.photoUrl === "string" ? raw.photoUrl : typeof raw?.imageUrl === "string" ? raw.imageUrl : undefined,
  };
}

/* -------------------------------------------------------
   FIND PARENT CONTACT
------------------------------------------------------- */

async function resolveParentContact(supabase: any, targetUserId?: string, studentId?: string) {
  const lookupId = targetUserId || studentId;

  if (!lookupId) {
    return null;
  }

  try {
    let { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", lookupId)
      .maybeSingle();

    if (profileError) {
      console.error("Parent contact lookup by user ID failed:", profileError.message);
    }

    if (!profile) {
      const result = await supabase
        .from("profiles")
        .select("*")
        .eq("id", lookupId)
        .maybeSingle();

      if (result.error) {
        console.error("Parent contact lookup by profile ID failed:", result.error.message);
      }
      profile = result.data;
    }

    if (profile) {
      const metadata = profile.metadata || {};

      return {
        email: profile.parent_email || profile.email || null,

        phone: normalizePhone(profile.parent_phone || metadata.parent_phone || profile.phone || null),

        name: profile.parent_name || null,
      };
    }
  } catch (error) {
    console.error("Parent contact lookup failed:", error);
  }

  return null;
}

/* -------------------------------------------------------
   IN-APP NOTIFICATION
------------------------------------------------------- */

async function storeInAppNotification(
  supabase: any,
  userId: string | undefined,
  title: string,
  message: string,
  type = "attendance",
) {
  if (!userId) {
    return {
      success: false,
      error: "No target user ID",
    };
  }

  try {
    const { error } = await supabase.from("notifications").insert({
      user_id: userId,
      title,
      message,
      type,
      is_read: false,
    });

    if (error) {
      console.error("In-app notification error:", error);

      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "In-app notification failed",
    };
  }
}

/* -------------------------------------------------------
   MAIN FUNCTION
------------------------------------------------------- */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Only POST requests are supported",
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");

    const cronHeader = req.headers.get("x-cron-secret");

    const isCronCall = !!cronSecret && !!cronHeader && cronHeader === cronSecret;

    /*
     * Authentication
     */
    if (!authHeader && !isCronCall) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unauthorized",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader || "",
        },
      },
    });

    const dbClient = createClient(supabaseUrl, serviceRoleKey);

    let user: any = null;

    if (authHeader) {
      const result = await supabaseClient.auth.getUser();

      if (result.error || !result.data.user) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid authentication",
          }),
          {
            status: 401,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      }

      user = result.data.user;
    }

    /*
     * Parse request
     */
    let rawBody: any;

    try {
      rawBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid JSON body",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const payload = normalizePayload(rawBody);

    if (!payload.body.trim()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Message body is required",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    /*
     * Find recipient
     */
    const parentContact = await resolveParentContact(dbClient, payload.targetUserId, payload.student.id);

    const recipientEmail =
      normalizeEmail(payload.recipient.email) || normalizeEmail(parentContact?.email) || normalizeEmail(fallbackEmail);

    const recipientPhone = normalizePhone(payload.recipient.phone || parentContact?.phone || null);

    const recipientName = payload.recipient.name || parentContact?.name || "Parent/Guardian";

    /*
     * Result variables
     */
    let emailSent = false;
    let emailError: string | null = null;
    let emailId: string | null = null;

    let whatsappSent = false;
    let whatsappError: string | null = null;

    let smsSent = false;
    let smsError: string | null = null;
    let smsProvider: string | null = null;

    let inAppSent = false;
    let inAppError: string | null = null;

    /*
     * EMAIL
     */
    if (recipientEmail) {
      try {
        const studentId = payload.targetUserId || payload.student.id || "student";

        // Check "1 Student, 1 Email per Day" rate limit setting
        let emailRateLimitEnabled = true;
        try {
          const { data: limitSetting } = await dbClient
            .from('attendance_settings')
            .select('value')
            .eq('key', 'one_student_one_email_per_day')
            .maybeSingle();

          if (limitSetting && (limitSetting.value === 'false' || limitSetting.value === 'disabled' || limitSetting.value === '0')) {
            emailRateLimitEnabled = false;
          }
        } catch (err) {
          console.warn('Could not read one_student_one_email_per_day setting:', err);
        }

        let skipDueToLimit = false;
        if (emailRateLimitEnabled && !payload.isBroadcast) {
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);

          const { data: todayLogs } = await dbClient
            .from('notification_log')
            .select('id')
            .eq('channel', 'email')
            .eq('status', 'sent')
            .or(`user_id.eq.${studentId},recipient.eq.${recipientEmail}`)
            .gte('created_at', startOfToday.toISOString())
            .limit(1);

          if (todayLogs && todayLogs.length > 0) {
            skipDueToLimit = true;
            emailSent = true;
            console.log(`[1 Student 1 Email Limit] Email already sent today for ${payload.student.name || studentId}. Skipping duplicate.`);
          }
        }

        if (!skipDueToLimit) {
          const studentRegisteredPhoto = await resolveStudentPhotoUrl(dbClient, studentId, payload.student.name);
          let hostedSnapshot = null;

          try {
            hostedSnapshot = await hostSnapshot(
              dbClient,
              studentId,
              payload.photoUrl || (payload.metadata as any)?.image_url || null,
            );
          } catch (error) {
            console.error("Photo hosting failed:", error);
          }

          const status = ["present", "late", "absent"].includes(String(payload.student.status || "").toLowerCase())
            ? String(payload.student.status).toLowerCase()
            : "notification";

          const built = buildAttendanceEmail({
            studentName: payload.student.name || "Student",

            parentName: recipientName,

            status: status as any,

            photoUrl: studentRegisteredPhoto || hostedSnapshot,

            snapshotUrl: hostedSnapshot,

            bodyOverride: status === "notification" ? payload.body : null,

            subjectOverride: status === "notification" ? payload.subject : null,
          });

          const result = await sendEmail(recipientEmail, built.subject, built.html);

          if (result.ok) {
            emailSent = true;
            emailId = result.id || null;
          } else {
            emailError = result.error || "Email failed";
          }

          await dbClient.from("notification_log").insert({
            user_id: payload.targetUserId || payload.student.id || null,

            channel: "email",

            status: emailSent ? "sent" : "failed",

            subject: built.subject,

            message: payload.body,

            recipient: recipientEmail,

            metadata: {
              id: emailId,
              error: emailError,
            },
          });
        }
      } catch (error) {
        emailError = error instanceof Error ? error.message : "Email failed";

        console.error("Email processing failed:", error);
      }
    } else {
      emailError = "No email address available";
    }

    /*
     * WHATSAPP + SMS
     */
    if (recipientPhone) {
      const whatsappMessage = `${payload.subject}\n\n${payload.body}`;

      try {
        const result = await sendWhatsApp(recipientPhone, whatsappMessage);

        whatsappSent = result.success;

        whatsappError = result.success ? null : result.error || "WhatsApp failed";
      } catch (error) {
        whatsappError = error instanceof Error ? error.message : "WhatsApp failed";
      }

      try {
        const result = await sendSMS(recipientPhone, payload.body);

        smsSent = result.success;

        smsError = result.success ? null : result.error || "SMS failed";

        smsProvider = result.provider || null;
      } catch (error) {
        smsError = error instanceof Error ? error.message : "SMS failed";
      }
    } else {
      whatsappError = "No phone number available";

      smsError = "No phone number available";
    }

    /*
     * IN-APP
     */
    const targetUserId = payload.targetUserId || payload.student.id || user?.id || null;

    if (targetUserId) {
      try {
        const result = await storeInAppNotification(
          dbClient,
          targetUserId,
          payload.subject,
          payload.body,
          payload.student.status === "notification" ? "info" : "attendance",
        );

        inAppSent = result.success;

        inAppError = result.success ? null : result.error;
      } catch (error) {
        inAppError = error instanceof Error ? error.message : "In-app notification failed";
      }
    } else {
      inAppError = "No target user ID";
    }

    /*
     * Save dispatch summary
     */
    try {
      await dbClient.from("notifications").insert({
        user_id: user?.id || targetUserId || null,

        title: `Notification dispatch${payload.student.name ? ` • ${payload.student.name}` : ""}`,

        message: [
          emailSent ? "Email: sent" : `Email: ${emailError || "not sent"}`,

          whatsappSent ? "WhatsApp: sent" : `WhatsApp: ${whatsappError || "not sent"}`,

          smsSent ? `SMS (${smsProvider || "provider"}): sent` : `SMS: ${smsError || "not sent"}`,

          inAppSent ? "In-app: sent" : `In-app: ${inAppError || "not sent"}`,
        ].join(" | "),

        type: "notification_dispatch",
      });
    } catch (error) {
      console.error("Dispatch log failed:", error);
    }

    /*
     * IMPORTANT:
     *
     * Do NOT return HTTP 500 simply because
     * an external notification provider isn't
     * configured.
     *
     * This prevents the frontend from showing
     * "Edge function returned 500".
     */
    const delivered = emailSent || whatsappSent || smsSent || inAppSent;

    return new Response(
      JSON.stringify({
        success: true,

        delivered,

        message: delivered
          ? "Notification processed successfully"
          : "Notification request processed, but no external channel was delivered",

        channels: {
          email: {
            sent: emailSent,
            id: emailId,
            error: emailError,
          },

          whatsapp: {
            sent: whatsappSent,
            error: whatsappError,
          },

          sms: {
            sent: smsSent,
            provider: smsProvider,
            error: smsError,
          },

          inApp: {
            sent: inAppSent,
            error: inAppError,
          },
        },
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("send-notification fatal error:", error);

    /*
     * Return a controlled response instead
     * of exposing an unhandled Edge Function
     * runtime error.
     */
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Notification function failed",
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
