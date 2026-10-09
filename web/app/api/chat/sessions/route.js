import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/session-cookie';
import { getSupabaseServer, isSupabaseServerConfigured } from '@/lib/supabase-server';

function rowToClient(row) {
  return {
    id: row.id,
    title: row.title,
    contextType: row.context_type || null,
    contextMeta: row.context_meta || null,
    greetingSeed: row.greeting_seed || row.id,
    updatedAt: new Date(row.updated_at).getTime(),
    messages: Array.isArray(row.messages) ? row.messages : [],
  };
}

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ sessions: [], persistence: 'local' });
  }

  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from('casta4_chat_sessions')
      .select('*')
      .eq('user_email', session.email)
      .order('updated_at', { ascending: false })
      .limit(24);
    if (error) throw error;
    return NextResponse.json({
      sessions: (data || []).map(rowToClient),
      persistence: 'supabase',
    });
  } catch (err) {
    console.error('chat sessions GET:', err);
    return NextResponse.json({ error: 'Failed to load chats' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = body.id || crypto.randomUUID();
  const row = {
    id,
    user_email: session.email,
    title: String(body.title || 'New chat').slice(0, 120),
    context_type: body.contextType || null,
    context_meta: body.contextMeta || null,
    messages: Array.isArray(body.messages) ? body.messages : [],
    greeting_seed: body.greetingSeed || id,
    updated_at: new Date().toISOString(),
  };

  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ session: rowToClient(row), persistence: 'local' });
  }

  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb.from('casta4_chat_sessions').upsert(row).select('*').single();
    if (error) throw error;
    return NextResponse.json({ session: rowToClient(data), persistence: 'supabase' });
  } catch (err) {
    console.error('chat sessions POST:', err);
    return NextResponse.json({ error: 'Failed to create chat' }, { status: 500 });
  }
}
