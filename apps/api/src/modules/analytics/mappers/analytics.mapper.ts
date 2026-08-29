export function calculateConversionRate(won: number, lost: number): number {
  const denominator = won + lost;
  if (denominator === 0) {
    return 0;
  }

  return Math.round((won / denominator) * 10000) / 100;
}

export function calculateSourceConversionRate(
  won: number,
  total: number,
): number {
  if (total === 0) {
    return 0;
  }

  return Math.round((won / total) * 1000) / 10;
}

export function calculatePercentage(part: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return Math.round((part / total) * 1000) / 10;
}

export function calculateDropOffPercentage(
  previousCount: number,
  currentCount: number,
): number {
  if (previousCount === 0) {
    return 0;
  }

  const dropOff = ((previousCount - currentCount) / previousCount) * 100;
  return Math.round(Math.max(0, dropOff) * 10) / 10;
}

export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

export function nullableAverage(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return roundToOneDecimal(value);
}
