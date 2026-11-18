// Üyelik cihaz bağlama sunucusu (Cloudflare Worker + SQLite tabanlı Durable Object; ücretsiz planda çalışır).
// Uygulama her açılışta ve öne gelişinde POST /v1/claim ile sorar; kural server/logic.js'te. Kurulum: server/README.md
import { DurableObject } from 'cloudflare:workers';
import { claim } from './logic.js';

// Tek nesne ("main") bütün bağlamaları tutar; Durable Object tek iş parçacıklı olduğundan oku-yaz bölünmez.
export class Bindings extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS b (sub TEXT NOT NULL, kind TEXT NOT NULL, dev TEXT NOT NULL, since INTEGER NOT NULL, at INTEGER NOT NULL, moves TEXT NOT NULL, PRIMARY KEY (sub, kind))');
  }

  claim(req) {
    const store = {
      get: (sub, kind) => {
        const r = this.sql.exec('SELECT dev, since, at, moves FROM b WHERE sub = ? AND kind = ?', sub, kind).toArray()[0];
        return r ? { dev: r.dev, since: r.since, at: r.at, moves: JSON.parse(r.moves) } : null;
      },
      put: (sub, kind, row) => {
        this.sql.exec('INSERT OR REPLACE INTO b (sub, kind, dev, since, at, moves) VALUES (?, ?, ?, ?, ?, ?)', sub, kind, row.dev, row.since, row.at, JSON.stringify(row.moves));
      },
    };
    return claim(store, req);
  }
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' };
const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/' || url.pathname === '/v1/ping') return reply({ ok: true });
    if (url.pathname !== '/v1/claim' || request.method !== 'POST') return reply({ status: 'bad' }, 404);
    const text = await request.text();
    if (text.length > 1024) return reply({ status: 'bad' }, 413);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return reply({ status: 'bad' }, 400);
    }
    const res = await env.BIND.get(env.BIND.idFromName('main')).claim({ s: body && body.s, d: body && body.d, k: body && body.k, take: !!body && body.take === true });
    return reply(res, res.status === 'bad' ? 400 : 200);
  },
};
