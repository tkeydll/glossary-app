export async function run (context, req) {
  context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, time: new Date().toISOString() }) };
}
