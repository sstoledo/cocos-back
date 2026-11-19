import { peruTimestamp } from './peru-time';

describe('peruTimestamp', () => {
  it('returns the local date and time in Peru', () => {
    expect(peruTimestamp(new Date('2026-11-19T05:00:00Z'))).toEqual({
      date: '2026-11-19',
      time: '00:00:00',
    });
  });

  it('rolls the date back when UTC is already the next day', () => {
    // 21:00 in Lima on the 19th is 02:00 UTC on the 20th; the CPE must carry
    // the local date, not the UTC one.
    expect(peruTimestamp(new Date('2026-11-20T02:00:00Z'))).toEqual({
      date: '2026-11-19',
      time: '21:00:00',
    });
  });

  it('handles the last second of the local day', () => {
    expect(peruTimestamp(new Date('2026-11-19T04:59:59Z'))).toEqual({
      date: '2026-11-18',
      time: '23:59:59',
    });
  });
});
