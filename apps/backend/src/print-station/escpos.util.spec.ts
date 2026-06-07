import { buildEscPosTicket } from './escpos.util';

describe('buildEscPosTicket', () => {
  it('returns a Buffer', () => {
    const result = buildEscPosTicket({
      stationName: 'Kitchen',
      orderShortId: 'ABC123',
      tableName: 'T1',
      customerName: 'John',
      items: [{ quantity: 2, name: 'Burger', notes: 'no onion' }],
      timestamp: new Date('2026-01-01T12:00:00Z'),
    });
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes item name and quantity', () => {
    const result = buildEscPosTicket({
      stationName: 'Bar',
      orderShortId: 'XYZ',
      customerName: 'Alice',
      items: [{ quantity: 3, name: 'Beer' }],
      timestamp: new Date(),
    });
    expect(result.toString('utf8')).toContain('3x  Beer');
  });

  it('includes notes when present', () => {
    const result = buildEscPosTicket({
      stationName: 'Kitchen',
      orderShortId: '001',
      customerName: 'Bob',
      items: [{ quantity: 1, name: 'Steak', notes: 'rare' }],
      timestamp: new Date(),
    });
    expect(result.toString('utf8')).toContain('>> rare');
  });

  it('omits table line when tableName not provided', () => {
    const result = buildEscPosTicket({
      stationName: 'Kitchen',
      orderShortId: '002',
      customerName: 'Eve',
      items: [{ quantity: 1, name: 'Soup' }],
      timestamp: new Date(),
    });
    expect(result.toString('utf8')).not.toContain('Table:');
  });
});
