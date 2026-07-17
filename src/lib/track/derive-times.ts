import {
  toFlightTrackSamples,
  type FlightTrackPayload,
  type FlightTrackSample,
} from './schema';

export type DerivedFlightTimes = {
  /** Off-block / gate departure, epoch seconds (UTC), or null. */
  gateDeparture: number | null;
  /** Wheels-up, epoch seconds (UTC), or null. */
  takeoff: number | null;
  /** Wheels-down, epoch seconds (UTC), or null. */
  landing: number | null;
  /** On-block / gate arrival, epoch seconds (UTC), or null. */
  gateArrival: number | null;
};

export type DeriveFlightTimesResult = DerivedFlightTimes & {
  reasons: {
    /** The track carries no timestamps, so nothing can be derived. */
    noTimes: boolean;
    /** No on-ground flags and no altitude, so takeoff/landing are unknown. */
    noVerticalSignal: boolean;
    /** The track never transitions between ground and air (e.g. starts/ends
     *  airborne), so takeoff and/or landing could not be found. */
    noGroundTransition: boolean;
  };
};

// A point more than ~500 ft above the track's lowest point counts as airborne.
const AIRBORNE_ALTITUDE_THRESHOLD_METERS = 150;
// Ground speed above this (knots) counts as "moving" for off/on-block timing.
const TAXI_SPEED_THRESHOLD_KT = 3;

const emptyResult = (): DeriveFlightTimesResult => ({
  gateDeparture: null,
  takeoff: null,
  landing: null,
  gateArrival: null,
  reasons: {
    noTimes: true,
    noVerticalSignal: false,
    noGroundTransition: false,
  },
});

const findLastIndex = <T>(
  values: T[],
  predicate: (value: T, index: number) => boolean,
): number => {
  for (let index = values.length - 1; index >= 0; index--) {
    if (predicate(values[index]!, index)) return index;
  }
  return -1;
};

const altitudeOf = (sample: FlightTrackSample): number | null =>
  sample.coordinate[2] ?? null;

/**
 * Per-sample airborne state: `true`/`false` when known, `null` when the sample
 * carries no usable vertical signal. Prefers on-ground flags (most reliable,
 * e.g. readsb/ADS-B); otherwise thresholds altitude against the track's lowest
 * recorded point.
 */
const resolveAirborneStates = (
  samples: FlightTrackSample[],
): { states: (boolean | null)[]; hasSignal: boolean } => {
  // Ground flags are stored as an aligned, all-or-nothing array.
  if (samples[0]?.point.ground !== undefined) {
    return { states: samples.map((s) => !s.point.ground), hasSignal: true };
  }

  const altitudes = samples.map(altitudeOf);
  const known = altitudes.filter((value): value is number => value !== null);
  if (known.length < 2) {
    return { states: samples.map(() => null), hasSignal: false };
  }

  const threshold = Math.min(...known) + AIRBORNE_ALTITUDE_THRESHOLD_METERS;
  return {
    states: altitudes.map((value) =>
      value === null ? null : value > threshold,
    ),
    hasSignal: true,
  };
};

/**
 * Reconstruct off-block / takeoff / landing / on-block times from a stored
 * flight track. Returns epoch-second timestamps (or null per field) plus the
 * reasons any field could not be derived. Purely a function of the track — no
 * airport, gate, or terminal data is used or produced.
 */
export const deriveFlightTimesFromTrack = (
  track: FlightTrackPayload,
): DeriveFlightTimesResult => {
  const samples = toFlightTrackSamples(track);

  // Timestamps are stored aligned all-or-nothing; without them nothing works.
  const times = samples.map((sample) => sample.point.time);
  if (samples.length < 2 || times.some((time) => time === undefined)) {
    return emptyResult();
  }
  const timeAt = (index: number) => times[index]!;
  const lastIndex = samples.length - 1;

  // Gate times: first/last movement when ground speed is available, else the
  // first/last recorded point.
  const speeds = samples.map((sample) => sample.point.groundSpeedKt);
  const hasSpeed = speeds[0] !== undefined;
  const isMoving = (speed: number | undefined) =>
    speed !== undefined && speed > TAXI_SPEED_THRESHOLD_KT;
  const firstMoving = hasSpeed ? speeds.findIndex(isMoving) : -1;
  const lastMoving = hasSpeed ? findLastIndex(speeds, isMoving) : -1;

  const gateDeparture = timeAt(firstMoving >= 0 ? firstMoving : 0);
  const gateArrival = timeAt(lastMoving >= 0 ? lastMoving : lastIndex);

  let takeoff: number | null = null;
  let landing: number | null = null;

  const { states, hasSignal } = resolveAirborneStates(samples);
  if (hasSignal) {
    const firstAirborne = states.findIndex((state) => state === true);
    const lastAirborne = findLastIndex(states, (state) => state === true);

    // Takeoff = leaving the ground: need a confirmed on-ground sample before
    // the first airborne one.
    if (
      firstAirborne > 0 &&
      states.slice(0, firstAirborne).some((state) => state === false)
    ) {
      takeoff = timeAt(firstAirborne);
    }

    // Landing = the first confirmed on-ground sample after the last airborne one.
    if (lastAirborne >= 0 && lastAirborne < lastIndex) {
      const groundAfter = states.findIndex(
        (state, index) => index > lastAirborne && state === false,
      );
      if (groundAfter !== -1) landing = timeAt(groundAfter);
    }
  }

  return {
    gateDeparture,
    takeoff,
    landing,
    gateArrival,
    reasons: {
      noTimes: false,
      noVerticalSignal: !hasSignal,
      noGroundTransition: hasSignal && takeoff === null && landing === null,
    },
  };
};
