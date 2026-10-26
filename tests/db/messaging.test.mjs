// SQL behaviour tests for supabase/proposed/16 + 17 (text-only messaging with message requests) on the REAL production
// schema in PGlite. Run with: npm run test:db
// Owner rules (2026-10-26): anyone may message anyone; users connected to each other (both pressed Connect) chat normally,
// otherwise the conversation is a message request for the recipient until they accept or reply. Admins see counts only.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDb, as, ids, seed, addBookingStartingIn, rejects, ALL } from './harness.mjs';

const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];
const count = async (db, sql, params) => Number((await db.query(sql, params)).rows[0].count);
const setup = async () => {
  const db = await createDb({ proposed: [...ALL, '09', '11', '12', '13', '14', '15', '16', '17', '18', '19'] });
  await seed(db);
  return db;
};
const open = (db, me, other) => as(db, me, 'select public.get_or_create_conversation($1) r', [other]).then((x) => x.rows[0].r);
const send = (db, me, conv, text, key = randomUUID()) => as(db, me, 'select public.send_message($1, $2, $3) r', [conv, text, key]).then((x) => x.rows[0].r);
const list = (db, me, box = 'inbox') => as(db, me, 'select * from public.list_conversations($1)', [box]).then((x) => x.rows);
const badges = (db, me) => as(db, me, 'select public.chat_badges() b').then((x) => x.rows[0].b);
const follow = (db, a, b) => db.query('insert into public.followers (follower_id, following_id) values ($1, $2)', [a, b]);

describe('17 — requests versus normal chats', () => {
  test('not connected: the first message is a request for the recipient (one notification, no text in it); reply accepts', async () => {
    const db = await setup();
    const c = await open(db, ids.farmerA, ids.farmerB);
    assert.equal(c.state, 'request_outgoing');
    await send(db, ids.farmerA, c.conversation_id, 'Hello, can you advise on my wheat?');
    await send(db, ids.farmerA, c.conversation_id, 'Second message while pending');
    assert.equal((await list(db, ids.farmerA)).length, 1, 'sender sees it in the inbox');
    assert.equal((await list(db, ids.farmerB)).length, 0, 'recipient inbox must not show a request');
    const req = await list(db, ids.farmerB, 'requests');
    assert.deepEqual([req.length, req[0].state, req[0].unread_count], [1, 'request_incoming', 2]);
    assert.deepEqual(await badges(db, ids.farmerB), { inbox_unread: 0, requests: 1, requests_unread: 2 });
    const notes = (await db.query(`select message from public.notifications where user_id = $1 and type = 'message'`, [ids.farmerB])).rows;
    assert.equal(notes.length, 1, 'only the first request message notifies');
    assert.match(notes[0].message, /sent you a message request/);
    assert.doesNotMatch(notes[0].message, /wheat/);
    await send(db, ids.farmerB, c.conversation_id, 'Sure, tell me more');   // replying accepts
    assert.equal((await list(db, ids.farmerB))[0].state, 'normal');
    assert.equal((await list(db, ids.farmerB, 'requests')).length, 0);
    await send(db, ids.farmerA, c.conversation_id, 'Thanks!');
    assert.match((await one(db, `select message from public.notifications where user_id = $1 and type = 'message' order by created_at desc limit 1`, [ids.farmerB])).message, /^New message from/);
  });

  test('connected to each other: normal chat straight away; one-way connection is still a request', async () => {
    const db = await setup();
    await follow(db, ids.farmerA, ids.farmerB);
    const c = await open(db, ids.farmerA, ids.farmerB);
    assert.equal(c.state, 'request_outgoing', 'one-way Connect is not "connected to each other"');
    await follow(db, ids.farmerB, ids.farmerA);
    await send(db, ids.farmerA, c.conversation_id, 'hi');
    assert.equal((await list(db, ids.farmerB))[0].state, 'normal');
    assert.equal((await badges(db, ids.farmerB)).inbox_unread, 1);
  });

  test('19: a chat that was normal while connected stays normal after one side disconnects', async () => {
    const db = await setup();
    await follow(db, ids.farmerA, ids.farmerB); await follow(db, ids.farmerB, ids.farmerA);
    const c = await open(db, ids.farmerA, ids.farmerB);
    await send(db, ids.farmerA, c.conversation_id, 'hi friend');
    await db.query('delete from public.followers where follower_id = $1 and following_id = $2', [ids.farmerB, ids.farmerA]);
    assert.equal((await list(db, ids.farmerB))[0]?.state, 'normal', 'chat fell back into requests');
    assert.equal((await list(db, ids.farmerB, 'requests')).length, 0);
    // a chat that never had a message while connected is still a request after the disconnect
    const d = await open(db, ids.farmerA, ids.expertUser);
    await send(db, ids.farmerA, d.conversation_id, 'first contact');
    assert.equal((await list(db, ids.expertUser, 'requests'))[0]?.state, 'request_incoming');
  });

  test('decline hides the request and silences it; accept via the request button works; only the recipient answers', async () => {
    const db = await setup();
    const c = await open(db, ids.farmerA, ids.farmerB);
    await send(db, ids.farmerA, c.conversation_id, 'spam?');
    await rejects(as(db, ids.farmerA, 'select public.respond_to_message_request($1, true)', [c.conversation_id]), /no request to answer/);
    assert.equal((await as(db, ids.farmerB, 'select public.respond_to_message_request($1, false) r', [c.conversation_id])).rows[0].r, 'declined');
    assert.equal((await list(db, ids.farmerB, 'requests')).length, 0);
    const before = await count(db, `select count(*) from public.notifications where user_id = $1`, [ids.farmerB]);
    await send(db, ids.farmerA, c.conversation_id, 'still there?');
    assert.equal(await count(db, `select count(*) from public.notifications where user_id = $1`, [ids.farmerB]), before, 'declined request notified');
    assert.equal((await list(db, ids.farmerA))[0].state, 'request_outgoing', 'the sender is not told about the decline');
    assert.equal((await as(db, ids.farmerB, 'select public.respond_to_message_request($1, true) r', [c.conversation_id])).rows[0].r, 'normal');
  });

  test('a farmer and an expert who share a booking chat normally; the same pair always gets the same conversation', async () => {
    const db = await setup();
    await addBookingStartingIn(db, 600);
    const a = await open(db, ids.farmerA, ids.expertUser);
    const b = await open(db, ids.expertUser, ids.farmerA);
    assert.equal(a.conversation_id, b.conversation_id);
    assert.equal(a.state, 'normal');
  });
});

describe('17 — safety', () => {
  test('participants only; no direct writes; sender cannot be spoofed; only the other side is marked read', async () => {
    const db = await setup();
    const c = await open(db, ids.farmerA, ids.farmerB);
    const m = await send(db, ids.farmerA, c.conversation_id, 'private');
    await rejects(send(db, ids.expertUser, c.conversation_id, 'intrude'), /conversation not found/);
    await rejects(as(db, ids.expertUser, 'select * from public.get_messages($1)', [c.conversation_id]), /conversation not found/);
    assert.equal((await as(db, ids.expertUser, 'select id from public.messages')).rows.length, 0);
    assert.equal((await as(db, ids.admin, 'select id from public.messages')).rows.length, 0, 'admin reads private messages');
    await rejects(as(db, ids.farmerB, `insert into public.messages (conversation_id, sender_id, content) values ($1, $2, 'fake')`, [c.conversation_id, ids.farmerA]));
    await rejects(as(db, ids.farmerB, `update public.messages set content = 'edited' where id = $1`, [m.id]));
    await rejects(as(db, ids.farmerB, `insert into public.conversations (user_one, user_two) values ($1, $2)`, [ids.farmerB, ids.expertUser]));
    assert.equal((await as(db, ids.farmerA, 'select public.mark_conversation_read($1) n', [c.conversation_id])).rows[0].n, 0, 'sender marked own message read');
    assert.equal((await as(db, ids.farmerB, 'select public.mark_conversation_read($1) n', [c.conversation_id])).rows[0].n, 1);
    await rejects(as(db, null, 'select public.send_message($1, $2, $3)', [c.conversation_id, 'x', randomUUID()]), /permission denied|not authenticated/);
  });

  test('text rules: empty and 2001 chars refused, HTML kept as plain text, double send stored once with one notification', async () => {
    const db = await setup();
    const c = await open(db, ids.farmerA, ids.farmerB);
    await rejects(send(db, ids.farmerA, c.conversation_id, '   '), /Please type a message/);
    await rejects(send(db, ids.farmerA, c.conversation_id, 'x'.repeat(2001)), /up to 2000/);
    await send(db, ids.farmerA, c.conversation_id, 'x'.repeat(2000));
    const html = await send(db, ids.farmerA, c.conversation_id, '  <script>alert(1)</script><b>hi</b>  ');
    assert.equal(html.content, '<script>alert(1)</script><b>hi</b>');
    const key = randomUUID();
    const first = await send(db, ids.farmerB, c.conversation_id, 'once', key);
    const again = await send(db, ids.farmerB, c.conversation_id, 'once', key);
    assert.equal(again.id, first.id); assert.equal(again.duplicate, true);
    assert.equal(await count(db, `select count(*) from public.messages where content = 'once'`), 1);
    assert.equal(await count(db, `select count(*) from public.notifications where user_id = $1 and type = 'message'`, [ids.farmerA]), 1);
    assert.equal(await count(db, `select count(*) from public.notifications where user_id = $1 and type = 'message' and message like '%' || $2 || '%'`, [ids.farmerB, 'farmer-b']), 0, 'sender notified about own message');
    await rejects(open(db, ids.farmerA, ids.farmerA), /yourself/);
  });

  test('pushes: one per message notification, kind message, no message text; banned users cannot send; admin stats are counts', async () => {
    const db = await setup();
    await follow(db, ids.farmerA, ids.farmerB); await follow(db, ids.farmerB, ids.farmerA);
    const c = await open(db, ids.farmerA, ids.farmerB);
    await send(db, ids.farmerA, c.conversation_id, 'my secret harvest plan');
    const p = await one(db, `select title, body, data from public.push_outbox where user_id = $1`, [ids.farmerB]);
    assert.equal(p.data.kind, 'message'); assert.equal(p.data.conversation_id, c.conversation_id);
    assert.doesNotMatch(p.body, /secret/);
    const st = (await as(db, ids.admin, 'select public.admin_messaging_stats() s')).rows[0].s;
    assert.equal(st.conversations, 1); assert.equal(st.messages_7d, 1);
    assert.equal(JSON.stringify(st).includes('secret'), false);
    await rejects(as(db, ids.farmerA, 'select public.admin_messaging_stats()'), /Admin privileges/);
    await db.query('update public.profiles set is_banned = true where id = $1', [ids.farmerA]);
    await rejects(send(db, ids.farmerA, c.conversation_id, 'hi'), /banned/);
  });

  test('history pages: newest 30 first page, older pages by timestamp, oldest-first order inside a page', async () => {
    const db = await setup();
    const c = await open(db, ids.farmerA, ids.farmerB);
    for (let i = 1; i <= 35; i++) {
      await db.query(`insert into public.messages (conversation_id, sender_id, content, created_at) values ($1, $2, $3, now() - make_interval(secs => $4))`,
        [c.conversation_id, ids.farmerA, `m${i}`, 100 - i]);
    }
    const page1 = (await as(db, ids.farmerB, 'select content, created_at from public.get_messages($1)', [c.conversation_id])).rows;
    assert.deepEqual([page1.length, page1[0].content, page1.at(-1).content], [30, 'm6', 'm35']);
    const page2 = (await as(db, ids.farmerB, 'select content from public.get_messages($1, $2)', [c.conversation_id, page1[0].created_at])).rows;
    assert.deepEqual(page2.map((r) => r.content), ['m1', 'm2', 'm3', 'm4', 'm5']);
  });
});
