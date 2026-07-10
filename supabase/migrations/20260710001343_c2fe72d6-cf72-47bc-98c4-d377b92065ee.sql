create or replace function public.submit_ht_quiz_submission(
  _token_hash text,
  _session_id text,
  _status text,
  _nome text,
  _email text,
  _whatsapp text,
  _instagram text,
  _utm_source text,
  _utm_medium text,
  _utm_campaign text,
  _utm_content text,
  _fbc text,
  _fbp text,
  _fbclid text,
  _gclid text,
  _respostas jsonb,
  _raw jsonb
)
returns table(ok boolean, id uuid, received_at timestamptz, error text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _token_id uuid;
  _revoked_at timestamptz;
  _sub_id uuid;
  _sub_received_at timestamptz;
  _safe_status text;
  _safe_raw jsonb;
begin
  select t.id, t.revoked_at
    into _token_id, _revoked_at
  from public.ht_api_tokens t
  where t.token_hash = _token_hash
  limit 1;

  if _token_id is null or _revoked_at is not null then
    return query select false, null::uuid, null::timestamptz, 'Token inválido ou revogado'::text;
    return;
  end if;

  _safe_status := case when _status = 'completed' then 'completed' else 'partial' end;
  _safe_raw := coalesce(_raw, '{}'::jsonb);

  if _session_id is not null and btrim(_session_id) <> '' then
    insert into public.ht_quiz_submissions (
      token_id, session_id, status, nome, email, whatsapp, instagram,
      utm_source, utm_medium, utm_campaign, utm_content,
      fbc, fbp, fbclid, gclid, respostas, raw, updated_at
    ) values (
      _token_id, _session_id, _safe_status, _nome, _email, _whatsapp, _instagram,
      _utm_source, _utm_medium, _utm_campaign, _utm_content,
      _fbc, _fbp, _fbclid, _gclid, _respostas, _safe_raw, now()
    )
    on conflict (token_id, session_id) where session_id is not null
    do update set
      status = excluded.status,
      nome = excluded.nome,
      email = excluded.email,
      whatsapp = excluded.whatsapp,
      instagram = excluded.instagram,
      utm_source = excluded.utm_source,
      utm_medium = excluded.utm_medium,
      utm_campaign = excluded.utm_campaign,
      utm_content = excluded.utm_content,
      fbc = excluded.fbc,
      fbp = excluded.fbp,
      fbclid = excluded.fbclid,
      gclid = excluded.gclid,
      respostas = excluded.respostas,
      raw = excluded.raw,
      updated_at = now()
    returning ht_quiz_submissions.id, ht_quiz_submissions.received_at
      into _sub_id, _sub_received_at;
  else
    insert into public.ht_quiz_submissions (
      token_id, session_id, status, nome, email, whatsapp, instagram,
      utm_source, utm_medium, utm_campaign, utm_content,
      fbc, fbp, fbclid, gclid, respostas, raw, updated_at
    ) values (
      _token_id, null, _safe_status, _nome, _email, _whatsapp, _instagram,
      _utm_source, _utm_medium, _utm_campaign, _utm_content,
      _fbc, _fbp, _fbclid, _gclid, _respostas, _safe_raw, now()
    )
    returning ht_quiz_submissions.id, ht_quiz_submissions.received_at
      into _sub_id, _sub_received_at;
  end if;

  update public.ht_api_tokens
    set last_used_at = now()
  where ht_api_tokens.id = _token_id;

  return query select true, _sub_id, _sub_received_at, null::text;
end;
$$;

revoke all on function public.submit_ht_quiz_submission(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb) from public;
grant execute on function public.submit_ht_quiz_submission(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb) to anon;
grant execute on function public.submit_ht_quiz_submission(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.submit_ht_quiz_submission(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb, jsonb) to service_role;