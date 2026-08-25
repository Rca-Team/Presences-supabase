import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildAttendanceEmail, hostSnapshot } from '../_shared/attendance-email.ts'
const whatsappAccessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
const whatsappPhoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
const resendApiKey = Deno.env.get('RESEND_API_KEY');
const googleMailApiKey = Deno.env.get('GOOGLE_MAIL_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendEmailViaGmail(to: string, subject: string, html: string): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!lovableApiKey || !googleMailApiKey) {
    return { success: false, error: 'Gmail connector not configured' };
  }

  const rawEmail = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html,
  ].join('\r\n');

  try {
    const response = await fetch('https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        'X-Connection-Api-Key': googleMailApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: toBase64Url(rawEmail) }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { success: false, error: data?.error?.message || data?.message || 'Gmail send failed' };
    }

    return { success: true, id: data?.id || null };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gmail send failed' };
  }
}

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[A-Za-z]{2,}$/;

/** Returns a clean, RFC-valid address or null. Prevents Resend 422 validation_error. */
function normalizeEmail(email?: string | null): string | null {
  if (!email || typeof email !== 'string') return null;
  let clean = email.trim();
  const angle = clean.match(/<([^>]+)>/);
  if (angle) clean = angle[1].trim();
  clean = clean.replace(/^mailto:/i, '').toLowerCase();
  return EMAIL_RE.test(clean) ? clean : null;
}

const FROM_ADDRESS = Deno.env.get('RESEND_FROM') || 'School Alerts <noreply@presences.dev>';

async function sendEmailResendThenGmail(rawTo: string, rawSubject: string, rawHtml: string): Promise<{ success: boolean; provider?: 'resend' | 'gmail'; id?: string | null; error?: string }> {
  const to = normalizeEmail(rawTo);
  if (!to) return { success: false, error: `Invalid recipient email address: "${rawTo}"` };
  const subject = (rawSubject || '').trim() || 'School Notification';
  const html = (rawHtml || '').trim() || '<p>School notification</p>';

  if (resendApiKey) {
    try {

      if (resendApiKey.startsWith('re_')) {
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM_ADDRESS,
            to: [to],
            subject,
            html,
          }),
        });

        const resendData = await resendResponse.json().catch(() => ({}));
        if (resendResponse.ok) {
          return { success: true, provider: 'resend', id: resendData?.id || null };
        }

        const gmailFallback = await sendEmailViaGmail(to, subject, html);
        if (gmailFallback.success) {
          return { success: true, provider: 'gmail', id: gmailFallback.id || null };
        }

        return {
          success: false,
          error: `Resend failed: ${resendData?.message || 'unknown error'} | Gmail fallback failed: ${gmailFallback.error || 'unknown error'}`,
        };
      }

      if (lovableApiKey) {
        const resendResponse = await fetch('https://connector-gateway.lovable.dev/resend/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            'X-Connection-Api-Key': resendApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM_ADDRESS,
            to: [to],
            subject,
            html,
          }),
        });

        const resendData = await resendResponse.json().catch(() => ({}));
        if (resendResponse.ok) {
          return { success: true, provider: 'resend', id: resendData?.id || null };
        }

        const gmailFallback = await sendEmailViaGmail(to, subject, html);
        if (gmailFallback.success) {
          return { success: true, provider: 'gmail', id: gmailFallback.id || null };
        }

        return {
          success: false,
          error: `Resend failed: ${resendData?.error?.message || resendData?.message || 'unknown error'} | Gmail fallback failed: ${gmailFallback.error || 'unknown error'}`,
        };
      }
    } catch (err: any) {
      const gmailFallback = await sendEmailViaGmail(to, subject, html);
      if (gmailFallback.success) {
        return { success: true, provider: 'gmail', id: gmailFallback.id || null };
      }
      return { success: false, error: `Resend error: ${err?.message || 'unknown error'} | Gmail fallback failed: ${gmailFallback.error || 'unknown error'}` };
    }
  }

  const gmailResult = await sendEmailViaGmail(to, subject, html);
  if (gmailResult.success) {
    return { success: true, provider: 'gmail', id: gmailResult.id || null };
  }

  return { success: false, error: gmailResult.error || 'Email service not configured' };
}

async function sendWhatsAppMessage(phone: string, message: string): Promise<{ success: boolean; error?: string }> {
  if (!whatsappAccessToken || !whatsappPhoneNumberId) return { success: false, error: 'WhatsApp API not configured' };
  let formattedPhone = phone.replace(/[\s\-\(\)]/g, '');
  if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.substring(1);
  if (/^\d{10}$/.test(formattedPhone)) formattedPhone = '91' + formattedPhone;
  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/${whatsappPhoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${whatsappAccessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: formattedPhone, type: 'text', text: { body: message } }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error?.message || 'WhatsApp send failed' };
    return { success: true };
  } catch (err: any) { return { success: false, error: err.message }; }
}

async function sendSMS(phone: string, message: string): Promise<{ success: boolean; error?: string }> {
  const sms77Key = Deno.env.get('SMS77_RAPIDAPI_KEY');
  if (!sms77Key) return { success: false, error: 'SMS API not configured' };
  const cleanPhone = phone.replace(/[^\d]/g, '');
  const normalized = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  if (!/^\d{10,15}$/.test(normalized)) return { success: false, error: 'Invalid phone number' };
  try {
    const resp = await fetch('https://sms77io.p.rapidapi.com/sms', {
      method: 'POST',
      headers: {
        'x-rapidapi-key': sms77Key,
        'x-rapidapi-host': 'sms77io.p.rapidapi.com',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({ to: normalized, text: message }),
    });
    const data = await resp.json();
    const ok = resp.ok && data?.success !== false && !data?.error;
    return { success: ok, error: ok ? undefined : (data?.error?.message || data?.message || 'SMS send failed') };
  } catch (err: any) { return { success: false, error: err.message }; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { studentId, studentName, status, imageUrl } = await req.json();

    if (!studentId || !studentName || !status) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: profileData } = await supabaseClient
      .from('profiles')
      .select('parent_email, parent_name, parent_phone, phone, display_name, metadata, email, class, section')
      .eq('user_id', studentId)
      .maybeSingle();

    let parentEmail = normalizeEmail(profileData?.parent_email);
    let parentName = profileData?.parent_name || 'Parent/Guardian';
    let parentPhone = (profileData as any)?.parent_phone || (profileData as any)?.metadata?.parent_phone || profileData?.phone || null;

    // Fallback: if profile is missing parent email, recover from latest registration metadata.
    if (!parentEmail) {
      const { data: registrationRecord } = await supabaseClient
        .from('attendance_records')
        .select('device_info, student_name')
        .eq('user_id', studentId)
        .eq('status', 'registered')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const metadata = (registrationRecord as any)?.device_info?.metadata || {};
      parentEmail = normalizeEmail(metadata?.parent_email);
      parentName = metadata?.parent_name || parentName;
      parentPhone = metadata?.parent_phone || parentPhone;
    }

    // Final fallback: send to the student's own account email so the alert is never silently dropped.
    if (!parentEmail) {
      parentEmail = normalizeEmail((profileData as any)?.email)
        || normalizeEmail(Deno.env.get('NOTIFY_FALLBACK_EMAIL'));
    }

    const results = { emailSent: false, whatsappSent: false, smsSent: false, errors: [] as string[] };
    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const date = new Date().toLocaleDateString('en-IN');

    const alreadyWhatsApp = false;
    const alreadySMS = false;

    // Emails cannot render base64 data URIs — host the live capture first.
    const hostedPhoto = await hostSnapshot(supabaseClient, studentId, imageUrl);

    // 1. SEND EMAIL (premium school template with the student's face)
    if (parentEmail) {
      try {
        const built = buildAttendanceEmail({
          studentName,
          parentName,
          status: (String(status).toLowerCase() as any),
          time,
          date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
          className: (profileData as any)?.class || null,
          section: (profileData as any)?.section || null,
          photoUrl: hostedPhoto,
          method: 'Face ID',
        });

        const emailResult = await sendEmailResendThenGmail(parentEmail, built.subject, built.html);

        if (!emailResult.success) {
          results.errors.push(`Email: ${emailResult.error || 'failed'}`);
        } else {
          results.emailSent = true;
        }

        await supabaseClient.from('notification_log').insert({
          user_id: studentId,
          channel: 'email',
          status: emailResult.success ? 'sent' : 'failed',
          subject: built.subject,
          message: `${studentName} marked ${status}`,
          recipient: parentEmail,
          metadata: { provider: emailResult.provider || null, id: emailResult.id || null, error: emailResult.error || null, photo: hostedPhoto },
        });
      } catch (err: any) { results.errors.push(`Email: ${err.message}`); }
    } else {
      results.errors.push('Email: no parent email on file for this student');
    }

    // 2. SEND WHATSAPP
    if (parentPhone && !alreadyWhatsApp) {
      const msg = status === 'present'
        ? `✅ Dear ${parentName}, your child ${studentName} has arrived at school at ${time}. - Presence`
        : status === 'late'
        ? `⏰ Notice: ${studentName} arrived late at school at ${time} today. - Presence`
        : `❌ Alert: ${studentName} has been marked absent today (${date}). Contact the school if unexpected. - Presence`;

      const waResult = await sendWhatsAppMessage(parentPhone, msg);
      results.whatsappSent = waResult.success;
      if (!waResult.success) results.errors.push(`WhatsApp: ${waResult.error}`);

      await supabaseClient.from('notification_log').insert({
        user_id: studentId,
        channel: 'whatsapp',
        status: waResult.success ? 'sent' : 'failed',
        subject: `Attendance ${status}`,
        message: msg,
        recipient: parentPhone,
        metadata: waResult as any,
      });

      // 3. SMS — also send alongside email/whatsapp
      if (!alreadySMS) {
        const smsMsg = status === 'present'
          ? `Dear Parent, ${studentName} arrived at school at ${time}. - Presence`
          : status === 'late'
          ? `Dear Parent, ${studentName} arrived late at ${time}. - Presence`
          : `Dear Parent, ${studentName} is absent today (${date}). Contact school. - Presence`;
        const smsResult = await sendSMS(parentPhone, smsMsg);
        results.smsSent = smsResult.success;
        if (!smsResult.success) results.errors.push(`SMS: ${smsResult.error}`);
        await supabaseClient.from('notification_log').insert({
          user_id: studentId,
          channel: 'sms',
          status: smsResult.success ? 'sent' : 'failed',
          subject: `Attendance ${status}`,
          message: smsMsg,
          recipient: parentPhone,
          metadata: smsResult as any,
        });
      }
    }

    // 4. IN-APP NOTIFICATION
    await supabaseClient.from('notifications').insert({
      user_id: studentId,
      title: `Attendance Recorded: ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      message: `Your attendance was marked as ${status} at ${time}`,
      type: 'attendance',
      is_read: false,
      metadata: { photo: hostedPhoto, emailed: results.emailSent, recipient: parentEmail },
    });

    const channels = [results.emailSent && 'Email', results.whatsappSent && 'WhatsApp', results.smsSent && 'SMS', 'In-app'].filter(Boolean);
    return new Response(JSON.stringify({ success: true, ...results, message: `Sent via: ${channels.join(', ')}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Failed to send notification', details: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
