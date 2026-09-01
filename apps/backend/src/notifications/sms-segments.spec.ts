import { estimateSmsSegments } from './sms-segments';

describe('estimateSmsSegments', () => {
  it('uses GSM-7 single and multipart limits', () => {
    expect(estimateSmsSegments('a'.repeat(160))).toEqual({
      encoding: 'GSM_7',
      units: 160,
      segments: 1,
    });
    expect(estimateSmsSegments('a'.repeat(161)).segments).toBe(2);
  });

  it('counts GSM-7 extension characters as two septets', () => {
    expect(estimateSmsSegments('^'.repeat(80)).segments).toBe(1);
    expect(estimateSmsSegments('^'.repeat(81)).segments).toBe(2);
  });

  it('uses UCS-2 limits for Bulgarian text and surrogate pairs', () => {
    expect(estimateSmsSegments('Б'.repeat(70))).toEqual({
      encoding: 'UCS_2',
      units: 70,
      segments: 1,
    });
    expect(estimateSmsSegments('Б'.repeat(71)).segments).toBe(2);
    expect(estimateSmsSegments('😀'.repeat(35)).segments).toBe(1);
    expect(estimateSmsSegments('😀'.repeat(36)).segments).toBe(2);
  });
});
