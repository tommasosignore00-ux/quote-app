/**
 * @jest-environment node
 */
import { generateQuoteHTML, quoteLineExtras } from '../../lib/QuoteTemplate';

describe('template item rows with the company columns', () => {
  it('reads code, unit and discount from a quote line', () => {
    expect(
      quoteLineExtras({
        description: 'Cavo FS17 1,5 rotolo (cod. BTI CAVO1)',
        discount_percent: '5',
      })
    ).toEqual({ code: 'BTI CAVO1', unit: null, discount_percent: 5 });
    expect(
      quoteLineExtras({
        description: 'Tondi laminati 40 mm - 12,6 kg/m (prezzo al metro)',
      }).unit
    ).toBe('m');
    expect(quoteLineExtras({ description: 'Manodopera idraulico' }).unit).toBe('h');
  });

  it('repeats the row for every item with all columns and applies discounts to totals', () => {
    const html = generateQuoteHTML({
      lavoroTitle: 'Caldaia',
      clienteName: 'Esposito',
      revision: 1,
      vat_percent: 22,
      countryCode: 'IT',
      templateType: 'custom',
      customTemplateHtml:
        '<table><tbody>{{#items}}<tr><td>{{item.index}}</td><td>{{item.code}}</td><td>{{item.description}}</td>' +
        '<td>{{item.unit}}</td><td>{{item.quantity}}</td><td>{{item.price}}</td><td>{{item.discount}}</td>' +
        '<td>{{item.vat}}</td><td>{{item.total}}</td></tr>{{/items}}</tbody></table><p>{{subtotal}}|{{total}}</p>',
      items: [
        {
          description: 'Caldaia 24 kW (cod. CLD24)',
          quantity: 1,
          unit_price: 1850,
          ...quoteLineExtras({
            description: 'Caldaia 24 kW (cod. CLD24)',
            discount_percent: 10,
          }),
        },
        {
          description: 'Manodopera <installazione>',
          quantity: 6,
          unit_price: 38,
          unit: 'h',
        },
      ],
    });

    expect(html).toContain(
      '<tr><td>1</td><td>CLD24</td><td>Caldaia 24 kW</td><td></td><td>1</td><td>€ 1.850,00</td><td>10%</td><td>22%</td><td>€ 1.665,00</td></tr>'
    );
    expect(html).toContain(
      '<td>Manodopera &lt;installazione&gt;</td><td>h</td><td>6</td>'
    );
    expect(html).toContain('<p>€ 1.893,00|€ 2.309,46</p>');
    expect(html).not.toContain('{{');
  });
});
