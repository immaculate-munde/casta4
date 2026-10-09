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

export async function PUT(request, { params }) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const id = params.id;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ ok: true, persistence: 'local' });
  }

  const patch = { updated_at: new Date().toISOString() };
  if (body.title != null) patch.title = String(body.title).slice(0, 120);
  if (body.messages != null) patch.messages = body.messages;
  if (body.contextType !== undefined) patch.context_type = body.contextType;
  if (body.contextMeta !== undefined) patch.context_meta = body.contextMeta;

  try {
    const sb = getSupabaseServer();
    const { data, error } = await sb
      .from('casta4_chat_sessions')
      .update(patch)
      .eq('id', id)
      .eq('user_email', session.email)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }
    return NextResponse.json({ session: rowToClient(data), persistence: 'supabase' });
  } catch (err) {
    console.error('chat session PUT:', err);
    return NextResponse.json({ error: 'Failed to save chat' }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  if (!isSupabaseServerConfigured()) {
    return NextResponse.json({ ok: true, persistence: 'local' });
  }

  try {
    const sb = getSupabaseServer();
    const { error } = await sb
      .from('casta4_chat_sessions')
      .delete()
      .eq('id', params.id)
      .eq('user_email', session.email);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('chat session DELETE:', err);
    return NextResponse.json({ error: 'Failed to delete chat' }, { status: 500 });
  }
}
