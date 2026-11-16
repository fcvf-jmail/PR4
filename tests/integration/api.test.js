'use strict';
const { createApp } = require('../../src/app');

let server;
let base;

beforeEach(async () => {
  server = createApp({ seed: [] });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('GET /api/health отвечает HTTP 200', async () => {
  const response = await fetch(`${base}/api/health`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});

test('POST /api/tickets создает корректную заявку', async () => {
  const response = await fetch(`${base}/api/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Сбой принтера', description: 'Принтер в аудитории не отвечает',
      category: 'hardware', priority: 'medium'
    })
  });
  const body = await response.json();
  expect(response.status).toBe(201);
  expect(body.ticket.id).toBe(1);
  expect(body.ticket.status).toBe('new');
});

// Добавьте проверки GET с фильтрами, некорректных запросов,
// запретных переходов статуса и последовательных запросов к API.

// ---------- Собственные интеграционные тесты (Arrange – Act – Assert) ----------
const post = (path, body) => fetch(`${base}${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
});
const patch = (path, body) => fetch(`${base}${path}`, {
  method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
});
const list = async (query = '') => (await fetch(`${base}/api/tickets${query}`)).json();
const valid = (over = {}) => ({
  title: 'Сбой принтера', description: 'Принтер в аудитории не отвечает',
  category: 'hardware', priority: 'medium', ...over
});

describe('I: создание и чтение', () => {
  test('I-01 созданная заявка видна в GET с теми же данными', async () => {
    // Arrange + Act
    const created = await (await post('/api/tickets', valid({ title: '  Сбой   VPN в корпусе  ' }))).json();
    const body = await list();
    // Assert
    expect(body.total).toBe(1);
    expect(body.items[0]).toEqual(created.ticket);
    expect(body.items[0].title).toBe('Сбой VPN в корпусе');
    expect(body.items[0].status).toBe('new');
  });

  test('I-02 даже при status в теле заявка создаётся со статусом new', async () => {
    const res = await post('/api/tickets', { ...valid(), status: 'resolved' });
    expect((await res.json()).ticket.status).toBe('new');
  });

  test('I-03 ошибка валидации: 400, errors в теле, количество заявок не меняется', async () => {
    await post('/api/tickets', valid());
    const res = await post('/api/tickets', valid({ title: 'abc', category: 'x' }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.errors).toHaveProperty('title');
    expect(body.errors).toHaveProperty('category');
    expect((await list()).total).toBe(1);
  });

  test('I-04 тема из 4 символов + пробелы отклоняется (400)', async () => {
    const res = await post('/api/tickets', valid({ title: '   abcd   ' }));
    expect(res.status).toBe(400);
    expect((await list()).total).toBe(0);
  });

  test('I-05 невалидный JSON даёт 400', async () => {
    const res = await fetch(`${base}/api/tickets`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops'
    });
    expect(res.status).toBe(400);
  });
});

describe('I: фильтры, поиск, порядок', () => {
  async function seedThree() {
    await post('/api/tickets', valid({ title: 'Сеть недоступна', category: 'network', priority: 'high' }));
    await post('/api/tickets', valid({ title: 'Принтер сеть', category: 'hardware', priority: 'low' }));
    await post('/api/tickets', valid({ title: 'Сеть Wi-Fi', category: 'network', priority: 'low' }));
    await patch('/api/tickets/3/status', { status: 'in_progress' });
  }

  test('I-06 search + status + category одновременно (AND), регистр не важен', async () => {
    await seedThree();
    const body = await list('?search=%20%D0%A1%D0%95%D0%A2%D0%AC%20&status=in_progress&category=network');
    expect(body.total).toBe(1);
    expect(body.items[0].id).toBe(3);
  });

  test('I-07 порядок: high первым; в одном приоритете новее — выше', async () => {
    await seedThree();
    const ids = (await list()).items.map((t) => t.id);
    expect(ids[0]).toBe(1);
    expect(ids.slice(1)).toEqual([3, 2]);
  });

  test('I-08 GET /api/tickets?priority=high возвращает только high', async () => {
    await seedThree();
    const body = await list('?priority=high');
    expect(body.total).toBe(1);
    expect(body.items.every((t) => t.priority === 'high')).toBe(true);
  });

  test('I-09 priority сочетается с category и status', async () => {
    await seedThree();
    const body = await list('?priority=low&category=network&status=in_progress');
    expect(body.items.map((t) => t.id)).toEqual([3]);
  });
});

describe('I: смена статуса (400 / 404 / 409 / 200)', () => {
  beforeEach(async () => { await post('/api/tickets', valid()); });

  test('I-10 допустимые переходы: new → in_progress → resolved', async () => {
    const r1 = await patch('/api/tickets/1/status', { status: 'in_progress' });
    expect(r1.status).toBe(200);
    expect((await r1.json()).ticket.status).toBe('in_progress');
    const r2 = await patch('/api/tickets/1/status', { status: 'resolved' });
    expect(r2.status).toBe(200);
    expect((await list()).items[0].status).toBe('resolved');
  });

  test('I-11 пропуск этапа new → resolved: 409 и статус не изменился', async () => {
    const res = await patch('/api/tickets/1/status', { status: 'resolved' });
    expect(res.status).toBe(409);
    expect((await list()).items[0].status).toBe('new');
  });

  test('I-12 возврат resolved → new: 409', async () => {
    await patch('/api/tickets/1/status', { status: 'in_progress' });
    await patch('/api/tickets/1/status', { status: 'resolved' });
    expect((await patch('/api/tickets/1/status', { status: 'new' })).status).toBe(409);
  });

  test('I-13 неизвестный статус: 400; неизвестный id: 404', async () => {
    expect((await patch('/api/tickets/1/status', { status: 'done' })).status).toBe(400);
    expect((await patch('/api/tickets/999/status', { status: 'in_progress' })).status).toBe(404);
  });
});
