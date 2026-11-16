import { TicketsPage } from '../pages/TicketsPage';
import { TicketForm } from '../pages/TicketForm';

const page = new TicketsPage();
const form = new TicketForm();

describe('HelpDesk — базовые E2E-проверки', () => {
  beforeEach(() => {
    // Сброс доступен только при запуске npm run start:test.
    cy.request('POST', '/api/__reset');
  });

  it('показывает исходные заявки', () => {
    page.open();
    cy.get('[data-testid="page-title"]').should('contain', 'HelpDesk');
    page.items().should('have.length', 4);
    page.count().should('have.text', '4');
  });

  it('E-01 создаёт заявку через форму и показывает её в списке', () => {
    cy.intercept('POST', '/api/tickets').as('create');
    page.open();
    form.fill({ title: '  Сбой   VPN в корпусе  ', description: 'Не удается подключиться к учебной сети',
      category: 'network', priority: 'high' });
    form.submit();
    cy.wait('@create').its('response.statusCode').should('eq', 201);
    form.message().should('contain', 'Заявка №5 создана');
    page.count().should('have.text', '5');
    page.itemByTitle('Сбой VPN в корпусе').should('exist');
  });

  it('E-02 показывает ошибку валидации и не добавляет заявку', () => {
    page.open();
    form.fill({ title: 'abcd', description: 'Достаточно длинное описание' });
    form.submit();
    form.message().should('contain', 'Тема должна содержать от 5 до 80 символов');
    page.count().should('have.text', '4');
  });

  it('E-03 поиск без учёта регистра и комбинированная фильтрация', () => {
    page.open();
    page.searchFor('СЕТИ');
    page.items().should('have.length', 2);
    page.setStatus('resolved');
    page.items().should('have.length', 1);
    page.items().first().should('contain', 'Wi-Fi на этаже');
    page.count().should('have.text', '1');
    page.setCategory('hardware');
    page.items().should('not.exist');
    cy.get('[data-testid="ticket-list"]').should('contain', 'Заявок по заданным условиям нет');
  });

  it('E-04 фильтр по приоритету сочетается с категорией', () => {
    page.open();
    page.setPriority('high');
    page.items().should('have.length', 2);
    page.setCategory('network');
    page.setStatus('new');
    page.items().should('have.length', 1).and('contain', 'VPN недоступен');
  });

  it('E-05 реестр отсортирован: сначала high, затем medium, затем low', () => {
    page.open();
    page.items().then(($items) => {
      const titles = [...$items].map((el) => el.querySelector('.ticket-title').textContent);
      expect(titles).to.deep.equal(['Wi-Fi на этаже', 'VPN недоступен', 'Ошибка в офисном пакете', 'Мышь не работает']);
    });
  });

  it('E-06 переводит заявку в работу и завершает её', () => {
    page.open();
    page.advance('Мышь не работает');
    page.itemByTitle('Мышь не работает').should('contain', 'В работе');
    page.advance('Мышь не работает');
    page.itemByTitle('Мышь не работает').should('contain', 'Завершена').find('button').should('not.exist');
  });

  it('E-07 HTML из пользовательского ввода остаётся текстом', () => {
    page.open();
    form.fill({ title: '<b>Жирная</b> тема', description: '<img src=x onerror="window.__xss=1"> описание' });
    form.submit();
    form.message().should('contain', 'создана');
    page.itemByTitle('<b>Жирная</b> тема').find('.ticket-title b').should('not.exist');
    page.itemByTitle('<b>Жирная</b> тема').find('img').should('not.exist');
    cy.window().its('__xss').should('be.undefined');
  });
});
