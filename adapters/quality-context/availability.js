export function available(value) {
  return { status: 'available', value: structuredClone(value) };
}

export function missing(sourceAvailable = true) {
  return { status: sourceAvailable ? 'unknown' : 'unavailable' };
}

export function availability(value, sourceAvailable = true) {
  return value === undefined || value === null ? missing(sourceAvailable) : available(value);
}
