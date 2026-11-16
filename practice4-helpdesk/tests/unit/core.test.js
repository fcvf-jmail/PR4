'use strict';
const { normalizeTitle, validateTicketInput, canChangeStatus } = require('../../src/core');

describe('Базовые unit-тесты (дополните своими)', () => {
  test('удаляет пробелы в начале и конце темы', () => {
    expect(normalizeTitle('  Ошибка принтера  ')).toBe('Ошибка принтера');
  });

  test('отклоняет неизвестную категорию', () => {
    const errors = validateTicketInput({
      title: 'Ошибка печати', description: 'Принтер не печатает документ',
      category: 'unknown', priority: 'low'
    });
    expect(errors).toHaveProperty('category');
  });

  test('запрещает возвращение из закрытого статуса', () => {
    expect(canChangeStatus('resolved', 'new')).toBe(false);
  });

  // Добавьте самостоятельные проверки границ, переходов и сортировки.
});

const { filterAndSort } = require('../../src/core');

const validBase = { description: 'Достаточно длинное описание', category: 'software', priority: 'low' };
const mk = (id, priority, createdAt, extra = {}) => ({
  id, title: `Заявка ${id}`, description: 'Описание заявки для теста', category: 'software',
  priority, status: 'new', createdAt, ...extra
});

describe('U: нормализация темы (требование «Тема»)', () => {
  test('U-01 U-02 схлопывает любые последовательности пробельных символов', () => {
    expect(normalizeTitle('Сбой   принтера')).toBe('Сбой принтера');
    expect(normalizeTitle('  Сбой \t\n  принтера  в   аудитории ')).toBe('Сбой принтера в аудитории');
  });

  test('U-03 нестроковое значение даёт пустую строку', () => {
    expect(normalizeTitle(undefined)).toBe('');
    expect(normalizeTitle(42)).toBe('');
  });
});

describe('U: валидация длины темы — границы 5 и 80 (после нормализации)', () => {
  test.each([
    ['4 символа — ниже границы', 'abcd', true],
    ['5 символов — нижняя граница', 'abcde', false],
    ['80 символов — верхняя граница', 'a'.repeat(80), false],
    ['81 символ — выше границы', 'a'.repeat(81), true],
    ['5 символов + пробелы по краям', '  abcde  ', false],
    ['4 символа + пробелы по краям', '   abcd   ', true],
    ['5 символов только за счёт повторных пробелов', 'ab    c', true]
  ])('U-04 %s', (_name, title, hasError) => {
    const errors = validateTicketInput({ ...validBase, title });
    expect(Object.prototype.hasOwnProperty.call(errors, 'title')).toBe(hasError);
  });
});

describe('U: валидация описания — границы 10 и 500', () => {
  test.each([
    ['9 символов', 'a'.repeat(9), true],
    ['10 символов', 'a'.repeat(10), false],
    ['500 символов', 'a'.repeat(500), false],
    ['501 символ', 'a'.repeat(501), true],
    ['10 символов с пробелами по краям', '  ' + 'a'.repeat(10) + '  ', false]
  ])('U-05 %s', (_n, description, hasError) => {
    const errors = validateTicketInput({ ...validBase, title: 'Нормальная тема', description });
    expect('description' in errors).toBe(hasError);
  });

  test('U-06 некорректный приоритет и не-объект отклоняются', () => {
    expect(validateTicketInput({ ...validBase, title: 'Нормальная тема', priority: 'urgent' })).toHaveProperty('priority');
    expect(validateTicketInput(null)).toHaveProperty('input');
    expect(validateTicketInput([])).toHaveProperty('input');
  });
});

describe('U: переходы статусов', () => {
  test.each([
    ['new', 'in_progress', true],
    ['in_progress', 'resolved', true],
    ['new', 'resolved', false],
    ['in_progress', 'new', false],
    ['resolved', 'in_progress', false],
    ['new', 'new', false],
    ['new', 'bogus', false]
  ])('U-07 %s → %s: %s', (from, to, allowed) => {
    expect(canChangeStatus(from, to)).toBe(allowed);
  });
});

describe('U: поиск', () => {
  const data = [
    mk(1, 'low', '2026-10-01T00:00:00.000Z', { title: 'VPN недоступен', description: 'Нет сети' }),
    mk(2, 'low', '2026-10-02T00:00:00.000Z', { title: 'Принтер', description: 'Проблема с vpn-клиентом' })
  ];

  test('U-08 поиск не учитывает регистр (тема ИЛИ описание)', () => {
    expect(filterAndSort(data, { search: 'vpn' }).map((t) => t.id).sort()).toEqual([1, 2]);
    expect(filterAndSort(data, { search: 'ПРИНТЕР' }).map((t) => t.id)).toEqual([2]);
  });

  test('U-09 поисковая строка обрезается по краям', () => {
    expect(filterAndSort(data, { search: '  принтер  ' })).toHaveLength(1);
  });

  test('U-10 фильтры объединяются через AND', () => {
    const t = [
      mk(1, 'low', '2026-10-01T00:00:00.000Z', { category: 'network', status: 'new', title: 'Сеть A' }),
      mk(2, 'low', '2026-10-01T00:00:00.000Z', { category: 'network', status: 'resolved', title: 'Сеть B' }),
      mk(3, 'low', '2026-10-01T00:00:00.000Z', { category: 'software', status: 'new', title: 'Сеть C' })
    ];
    const res = filterAndSort(t, { search: 'сеть', status: 'new', category: 'network' });
    expect(res.map((x) => x.id)).toEqual([1]);
  });
});

describe('U: сортировка реестра', () => {
  test('U-11 сначала high, затем medium, затем low', () => {
    const res = filterAndSort([
      mk(1, 'low', '2026-10-01T00:00:00.000Z'),
      mk(2, 'high', '2026-10-01T00:00:00.000Z'),
      mk(3, 'medium', '2026-10-01T00:00:00.000Z')
    ]);
    expect(res.map((t) => t.priority)).toEqual(['high', 'medium', 'low']);
  });

  test('U-12 в пределах приоритета новые createdAt выше', () => {
    const res = filterAndSort([
      mk(1, 'high', '2026-10-01T00:00:00.000Z'),
      mk(2, 'high', '2026-10-03T00:00:00.000Z'),
      mk(3, 'high', '2026-10-02T00:00:00.000Z')
    ]);
    expect(res.map((t) => t.id)).toEqual([2, 3, 1]);
  });

  test('U-13 фильтрация не мутирует исходный массив', () => {
    const src = [mk(1, 'low', '2026-10-01T00:00:00.000Z'), mk(2, 'high', '2026-10-02T00:00:00.000Z')];
    filterAndSort(src);
    expect(src.map((t) => t.id)).toEqual([1, 2]);
  });
});

describe('U: фильтр по приоритету (задание A, TDD)', () => {
  const t = [
    mk(1, 'high', '2026-10-01T00:00:00.000Z', { category: 'network' }),
    mk(2, 'low', '2026-10-02T00:00:00.000Z', { category: 'network' }),
    mk(3, 'high', '2026-10-03T00:00:00.000Z', { category: 'software' })
  ];
  test('U-14 фильтрует по priority', () => {
    expect(filterAndSort(t, { priority: 'high' }).map((x) => x.id)).toEqual([3, 1]);
  });
  test('U-15 priority сочетается с category (AND)', () => {
    expect(filterAndSort(t, { priority: 'high', category: 'network' }).map((x) => x.id)).toEqual([1]);
  });
});
