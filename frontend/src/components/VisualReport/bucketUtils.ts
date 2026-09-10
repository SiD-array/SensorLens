export interface SensorBucket {
  id: string;
  name: string;
  color: string;
  isDefault?: boolean;
}

export type SensorBucketMap = Record<string, string>; // colName -> bucketId

export const STORAGE_BUCKETS_KEY = 'sensorlens_sensor_buckets';
export const STORAGE_BUCKET_MAP_KEY = 'sensorlens_sensor_bucket_mappings';

export const DEFAULT_BUCKETS: SensorBucket[] = [
  { id: 'cat_temp', name: 'Temperature', color: '#38bdf8', isDefault: true },
  { id: 'cat_press', name: 'Pressure', color: '#818cf8', isDefault: true },
  { id: 'cat_flow', name: 'Flow Rate', color: '#34d399', isDefault: true },
  { id: 'cat_speed', name: 'Speed / Motor', color: '#f59e0b', isDefault: true },
  { id: 'cat_power', name: 'Electrical / Power', color: '#f43f5e', isDefault: true },
  { id: 'cat_humidity', name: 'Humidity', color: '#06b6d4', isDefault: true },
  { id: 'cat_vibration', name: 'Vibration', color: '#a855f7', isDefault: true },
  { id: 'cat_progress', name: 'Cycle Progress', color: '#10b981', isDefault: true },
  { id: 'cat_general', name: 'General Sensors', color: '#94a3b8', isDefault: true }
];

export const PRESET_COLORS = [
  '#38bdf8', '#818cf8', '#34d399', '#f59e0b', 
  '#f43f5e', '#06b6d4', '#a855f7', '#10b981', 
  '#ec4899', '#f97316', '#64748b', '#e2e8f0'
];

/**
 * Prefix-based fallback heuristic when no explicit user mapping is present.
 */
export function getCategoryPrefix(name: string): string {
  const lower = name.toLowerCase();
  if (lower.startsWith('temp') || lower.startsWith('t_')) return 'cat_temp';
  if (lower.startsWith('press') || lower.startsWith('p_') || lower.startsWith('psi')) return 'cat_press';
  if (lower.startsWith('flow') || lower.startsWith('f_') || lower.startsWith('lpm')) return 'cat_flow';
  if (lower.startsWith('speed') || lower.startsWith('rpm') || lower.startsWith('motor')) return 'cat_speed';
  if (lower.startsWith('pwr') || lower.startsWith('power') || lower.startsWith('watt') || lower.startsWith('curr') || lower.startsWith('volt')) return 'cat_power';
  if (lower.startsWith('hum') || lower.startsWith('rh')) return 'cat_humidity';
  if (lower.startsWith('vib') || lower.startsWith('accel')) return 'cat_vibration';
  if (lower.startsWith('fmc') || lower.startsWith('moist') || lower.startsWith('weight')) return 'cat_progress';

  return 'cat_general';
}

/**
 * Load buckets from localStorage or fallback to defaults.
 */
export function loadBuckets(): SensorBucket[] {
  try {
    const saved = localStorage.getItem(STORAGE_BUCKETS_KEY);
    if (saved) {
      const parsed: SensorBucket[] = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load buckets from localStorage', e);
  }
  return DEFAULT_BUCKETS;
}

/**
 * Save buckets to localStorage.
 */
export function saveBuckets(buckets: SensorBucket[]): void {
  try {
    localStorage.setItem(STORAGE_BUCKETS_KEY, JSON.stringify(buckets));
  } catch (e) {
    console.error('Failed to save buckets', e);
  }
}

/**
 * Load sensor-to-bucket mappings from localStorage.
 */
export function loadBucketMap(): SensorBucketMap {
  try {
    const saved = localStorage.getItem(STORAGE_BUCKET_MAP_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load bucket map', e);
  }
  return {};
}

/**
 * Save sensor-to-bucket mappings to localStorage.
 */
export function saveBucketMap(map: SensorBucketMap): void {
  try {
    localStorage.setItem(STORAGE_BUCKET_MAP_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Failed to save bucket map', e);
  }
}

/**
 * Resolves which bucket a given sensor column belongs to.
 * 1. Explicit user mapping
 * 2. Prefix heuristic
 * 3. General Sensors bucket
 */
export function resolveSensorBucket(
  colName: string,
  buckets: SensorBucket[],
  bucketMap: SensorBucketMap
): SensorBucket {
  const safeBuckets = (buckets && buckets.length > 0) ? buckets : DEFAULT_BUCKETS;

  // Check user explicit mapping first
  const mappedBucketId = bucketMap[colName];
  if (mappedBucketId) {
    const found = safeBuckets.find(b => b.id === mappedBucketId);
    if (found) return found;
  }

  // Fallback to prefix heuristic
  const prefixCatId = getCategoryPrefix(colName);
  const prefixBucket = safeBuckets.find(b => b.id === prefixCatId);
  if (prefixBucket) return prefixBucket;

  // Final fallback: General Sensors or first available bucket
  return safeBuckets.find(b => b.id === 'cat_general') || safeBuckets[0];
}
