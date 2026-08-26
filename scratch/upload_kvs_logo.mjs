import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://cvdcbcsonlianbfeessy.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2ZGNiY3NvbmxpYW5iZmVlc3N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NDQ5MDcsImV4cCI6MjEwMzIyMDkwN30.fzJfZKKTw2Y3oFgk6fxVkfhdnIXNzXDeNa0CP84RxDg';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function main() {
  const filePath = 'C:/Users/pukhr/.gemini/antigravity/brain/0444117d-54f4-4ae9-bb6a-c176747cfc98/.user_uploaded/media_1787720089966.png';
  const fileBuf = fs.readFileSync(filePath);

  const { data, error } = await supabase.storage
    .from('face-images')
    .upload('kvs-emblem.png', fileBuf, {
      contentType: 'image/png',
      upsert: true,
    });

  if (error) {
    console.error('Upload failed:', error);
  } else {
    console.log('Upload success:', data);
    console.log('Public URL:', `${SUPABASE_URL}/storage/v1/object/public/face-images/kvs-emblem.png`);
  }
}

main();
