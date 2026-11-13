import { night, stop } from '@/theme/arcade';

describe('stop', () => {
  it('hands a see-through colour over as a solid colour and an opacity', () => {
    expect(stop('rgba(196, 178, 255, 0.42)')).toEqual({ stopColor: '#C4B2FF', stopOpacity: 0.42 });
    expect(stop('rgba(13,10,34,0)')).toEqual({ stopColor: '#0D0A22', stopOpacity: 0 });
    expect(stop('rgb(0, 8, 255)')).toEqual({ stopColor: '#0008FF', stopOpacity: 1 });
  });

  it('leaves a solid colour as it is', () => {
    expect(stop(night.wallTop)).toEqual({ stopColor: night.wallTop, stopOpacity: 1 });
  });

  it('keeps the spotlight see-through from the lamp to the floor', () => {
    expect(stop(night.beam).stopOpacity).toBeLessThan(0.6);
    expect(stop(night.beamFar).stopOpacity).toBeLessThan(stop(night.beam).stopOpacity);
    expect(stop(night.beam).stopColor).toBe(stop(night.beamFar).stopColor);
  });
});
