// scripts/getToken.ts
import { supabaseConnection } from '../database/supabase/connection';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

async function getToken() {
  const supabase = supabaseConnection.getServiceClient();

  const email = 'venon@danielvoelk.de';
  const password = 'YOUR_PASSWORD_HERE'; // Replace with actual password

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('❌ Login failed:', error.message);
    return;
  }

  console.log('\n✅ Login successful!\n');
  console.log('📋 Access Token:');
  console.log(data.session?.access_token);
  console.log('\n🔄 Refresh Token:');
  console.log(data.session?.refresh_token);
  console.log('\n📝 Use in Postman Authorization header:');
  console.log(`Bearer ${data.session?.access_token}`);
  console.log('\n⏰ Token expires at:', data.session?.expires_at);
  console.log('👤 User ID:', data.user?.id);
}

getToken();
