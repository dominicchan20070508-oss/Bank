// Order model + generation (DESIGN §6). Pure and deterministic given the Rng stream.
import { ORDERS } from './constants';
import { manhattan, type CityMap, type Door, type FoodKind } from './map';
import type { Rng } from './rng';

export type RequestId = 'noHorn' | 'gentle' | 'backDoor' | 'rush';
export type OrderStatus = 'waiting' | 'carrying' | 'delivered' | 'expired';

export const REQUEST_IDS: readonly RequestId[] = ['noHorn', 'gentle', 'backDoor', 'rush'];

export const REQUEST_INFO: Record<RequestId, { text: string; short: string; icon: string }> = {
  noHorn: { text: '不要按门铃，狗在睡觉', short: '别按喇叭', icon: '🐕' },
  gentle: { text: '轻拿轻放，奶奶在午睡', short: '别翻车', icon: '👵' },
  backDoor: { text: '放后门，别走正门', short: '送后门', icon: '🚪' },
  rush: { text: '饿死了！快点！！', short: '加急', icon: '🔥' },
};

export const FOOD_INFO: Record<FoodKind, { name: string; unit: string; icon: string }> = {
  soup: { name: '汤', unit: '碗', icon: '🍲' },
  pizza: { name: '披萨', unit: '盒', icon: '🍕' },
  ice: { name: '冰淇淋', unit: '球', icon: '🍦' },
};

export interface Order {
  id: string;
  restaurantId: string;
  customerId: string;
  food: FoodKind;
  size: number; // pizza boxes / ice-cream scoops / 1 for soup
  request: RequestId | null;
  createdAt: number; // server seconds
  timeLimit: number; // seconds, counted from pickup
  status: OrderStatus;
  carrierId: string | null;
  pickedAt: number | null;
  endedAt: number | null;
  distance: number; // metres, restaurant door -> delivery door (manhattan)
  // server-tracked flags for the special requests
  honkedNear: boolean;
  crashedDuring: boolean;
}

export function isActive(o: Order): boolean {
  return o.status === 'waiting' || o.status === 'carrying';
}

/** Door the order must be delivered to (back door for `backDoor` orders). */
export function targetDoor(map: CityMap, o: Pick<Order, 'customerId' | 'request'>): Door {
  const c = map.customers.find((cu) => cu.id === o.customerId);
  if (!c) throw new Error(`unknown customer ${o.customerId}`);
  return o.request === 'backDoor' ? c.back : c.front;
}

export function restaurantOf(map: CityMap, o: Pick<Order, 'restaurantId'>) {
  const r = map.restaurants.find((re) => re.id === o.restaurantId);
  if (!r) throw new Error(`unknown restaurant ${o.restaurantId}`);
  return r;
}

export function orderDistance(map: CityMap, restaurantId: string, customerId: string, request: RequestId | null): number {
  const r = map.restaurants.find((re) => re.id === restaurantId)!;
  const c = map.customers.find((cu) => cu.id === customerId)!;
  const d = request === 'backDoor' ? c.back : c.front;
  return manhattan(r.door.x, r.door.z, d.x, d.z);
}

export function orderTimeLimit(distance: number, request: RequestId | null): number {
  const base = distance / ORDERS.DELIVERY_SPEED + ORDERS.DELIVERY_SLACK;
  return request === 'rush' ? base * ORDERS.RUSH_TIME_MULT : base;
}

/**
 * Create a new waiting order. `existing` (the current order list) is used to spread orders over
 * restaurants and to avoid handing two orders to the same customer while others are free.
 */
export function createOrder(rng: Rng, map: CityMap, id: string, now: number, existing: readonly Order[]): Order {
  const active = existing.filter(isActive);

  // restaurant: favour the one with the fewest waiting orders
  const weights = map.restaurants.map((r) => 1 / (1 + 1.5 * active.filter((o) => o.restaurantId === r.id && o.status === 'waiting').length));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  let ri = 0;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) {
      ri = i;
      break;
    }
  }
  const restaurant = map.restaurants[ri]!;

  const busy = new Set(active.map((o) => o.customerId));
  const free = map.customers.filter((c) => !busy.has(c.id));
  const customer = rng.pick(free.length ? free : map.customers);

  let size: number = ORDERS.SOUP_SIZE;
  if (restaurant.food === 'pizza') size = rng.int(ORDERS.PIZZA_SIZE[0], ORDERS.PIZZA_SIZE[1]);
  else if (restaurant.food === 'ice') size = rng.int(ORDERS.ICE_SIZE[0], ORDERS.ICE_SIZE[1]);

  const request: RequestId | null = rng.chance(ORDERS.REQUEST_CHANCE) ? rng.pick(REQUEST_IDS) : null;
  const distance = orderDistance(map, restaurant.id, customer.id, request);

  return {
    id,
    restaurantId: restaurant.id,
    customerId: customer.id,
    food: restaurant.food,
    size,
    request,
    createdAt: now,
    timeLimit: orderTimeLimit(distance, request),
    status: 'waiting',
    carrierId: null,
    pickedAt: null,
    endedAt: null,
    distance,
    honkedNear: false,
    crashedDuring: false,
  };
}
