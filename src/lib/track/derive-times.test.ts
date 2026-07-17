import { describe, expect, it } from 'vitest';

import { deriveFlightTimesFromTrack } from './derive-times';
import type { FlightTrackPayload } from './schema';

const coords = (count: number, altitudes?: number[]): [number, number][] =>
  Array.from(
    { length: count },
    (_, index) =>
      (altitudes
        ? [index * 0.01, index * 0.01, altitudes[index]!]
        : [index * 0.01, index * 0.01]) as [number, number],
  );

describe('deriveFlightTimesFromTrack', () => {
  it('derives all four times from on-ground flags + timestamps (readsb-style)', () => {
    const track = {
      coordinates: coords(6),
      times: [100, 200, 300, 400, 500, 600],
      ground: [true, true, false, false, true, true],
    } as FlightTrackPayload;

    const result = deriveFlightTimesFromTrack(track);

    expect(result.gateDeparture).toBe(100);
    expect(result.takeoff).toBe(300); // first airborne sample
    expect(result.landing).toBe(500); // first on-ground sample after airborne
    expect(result.gateArrival).toBe(600);
    expect(result.reasons).toEqual({
      noTimes: false,
      noVerticalSignal: false,
      noGroundTransition: false,
    });
  });

  it('derives takeoff/landing from altitude when there are no ground flags', () => {
    const track = {
      coordinates: coords(6, [0, 10, 500, 600, 20, 0]), // metres
      times: [100, 200, 300, 400, 500, 600],
    } as FlightTrackPayload;

    const result = deriveFlightTimesFromTrack(track);

    expect(result.takeoff).toBe(300);
    expect(result.landing).toBe(500);
    expect(result.gateDeparture).toBe(100);
    expect(result.gateArrival).toBe(600);
    expect(result.reasons.noVerticalSignal).toBe(false);
  });

  it('uses ground speed to place off/on-block before takeoff / after landing', () => {
    const track = {
      coordinates: coords(6),
      times: [100, 200, 300, 400, 500, 600],
      ground: [true, true, false, false, true, true],
      // taxi-out at index 1 (still on ground), taxi-in at index 4
      groundSpeedKt: [0, 15, 150, 160, 12, 0],
    } as FlightTrackPayload;

    const result = deriveFlightTimesFromTrack(track);

    expect(result.gateDeparture).toBe(200); // first movement, earlier than takeoff
    expect(result.takeoff).toBe(300);
    expect(result.gateArrival).toBe(500); // last movement
  });

  it('returns only gate times when there is no altitude or ground signal', () => {
    const track = {
      coordinates: coords(4),
      times: [100, 200, 300, 400],
    } as FlightTrackPayload;

    const result = deriveFlightTimesFromTrack(track);

    expect(result.gateDeparture).toBe(100);
    expect(result.gateArrival).toBe(400);
    expect(result.takeoff).toBeNull();
    expect(result.landing).toBeNull();
    expect(result.reasons.noVerticalSignal).toBe(true);
  });

  it('returns all nulls when the track has no timestamps', () => {
    const track = {
      coordinates: coords(4),
      ground: [true, false, false, true],
    } as FlightTrackPayload;

    const result = deriveFlightTimesFromTrack(track);

    expect(result).toMatchObject({
      gateDeparture: null,
      takeoff: null,
      landing: null,
      gateArrival: null,
      reasons: { noTimes: true },
    });
  });

  it('leaves takeoff null when the track starts already airborne', () => {
    const track = {
      coordinates: coords(5),
      times: [100, 200, 300, 400, 500],
      ground: [false, false, false, true, true],
    } as FlightTrackPayload;

    const result = deriveFlightTimesFromTrack(track);

    expect(result.takeoff).toBeNull(); // no on-ground sample before the air
    expect(result.landing).toBe(400); // still resolves the descent
    expect(result.reasons.noGroundTransition).toBe(false); // landing succeeded
  });
});
