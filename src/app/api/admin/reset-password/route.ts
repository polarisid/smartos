import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function generatePassword(): string {
  return crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14);
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY not set.' },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get('authorization') || '';
    const callerToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!callerToken) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: 'Usuário não informado.' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Confere quem está chamando (não dá pra confiar em nada vindo do client aqui,
    // é uma rota que usa a service role e ignora RLS).
    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(callerToken);
    if (callerError || !callerData.user) {
      return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
    }

    const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
      .from('profiles')
      .select('role, unidade_id')
      .eq('id', callerData.user.id)
      .single();

    if (callerProfileError || !callerProfile) {
      return NextResponse.json({ error: 'Perfil do solicitante não encontrado.' }, { status: 403 });
    }

    const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
      .from('profiles')
      .select('role, unidade_id, email')
      .eq('id', userId)
      .single();

    if (targetProfileError || !targetProfile) {
      return NextResponse.json({ error: 'Usuário alvo não encontrado.' }, { status: 404 });
    }

    // Qualquer um pode trocar a própria senha. Além disso: master troca de
    // qualquer pessoa; admin só troca de gente da própria unidade, nunca de
    // um master.
    const isSelf = callerData.user.id === userId;
    const isAllowed =
      isSelf ||
      callerProfile.role === 'master' ||
      (callerProfile.role === 'admin' && targetProfile.role !== 'master' && targetProfile.unidade_id === callerProfile.unidade_id);

    if (!isAllowed) {
      return NextResponse.json({ error: 'Sem permissão para trocar a senha desse usuário.' }, { status: 403 });
    }

    const newPassword = generatePassword();
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, newPassword });
  } catch (error: any) {
    console.error('Reset password API error:', error);
    return NextResponse.json({ error: 'Erro interno do servidor.' }, { status: 500 });
  }
}
