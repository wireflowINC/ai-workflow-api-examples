#!/usr/bin/env node
// verify-webhook.mjs: check the X-Wireflow-Signature header on a Wireflow completion webhook.
//
// When you start a run with a "webhook": { "url", "secret" } block, Wireflow POSTs execution.completed or
// execution.failed to your URL and signs it: X-Wireflow-Signature: sha256=<hex>, an HMAC-SHA256 of the RAW
// request body with your secret (https://www.wireflow.ai/docs/api/webhooks). Verify it before you trust the
// payload, dedupe on eventId (retries reuse it), answer 2xx within 10 seconds and do slow work afterwards.
//
//   import { verifyWireflowSignature } from './verify-webhook.mjs';
//   if (!verifyWireflowSignature(rawBody, req.headers['x-wireflow-signature'], process.env.WIREFLOW_WEBHOOK_SECRET)) return 401;
//
//   node scripts/verify-webhook.mjs --self-test      signs a sample body and checks good and bad signatures

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyWireflowSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(String(header));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes('--self-test')) { console.log('usage: node scripts/verify-webhook.mjs --self-test'); process.exit(0); }
  const secret = 'test-secret-not-a-real-one';
  const body = JSON.stringify({ event: 'execution.completed', eventId: '550e8400-e29b-41d4-a716-446655440000', executionId: 'exec_789', status: 'COMPLETED', nodeStates: [] });
  const good = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  const checks = [
    ['correct signature', verifyWireflowSignature(body, good, secret) === true],
    ['body changed by one byte', verifyWireflowSignature(body + ' ', good, secret) === false],
    ['wrong secret', verifyWireflowSignature(body, good, 'other-secret') === false],
    ['missing header', verifyWireflowSignature(body, undefined, secret) === false],
  ];
  for (const [name, pass] of checks) console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}`);
  process.exitCode = checks.every(([, p]) => p) ? 0 : 1;
}
