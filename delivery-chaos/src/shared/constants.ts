// All tunable numbers live here (DESIGN §4-§7, §9). Pure data: no three / DOM imports.
//
// Conventions used everywhere in the codebase:
//   * World: x = east, z = south, y = up.  N = -z, S = +z, E = +x, W = -x.
//   * Heading h: forward = (sin h, 0, cos h);  rider's right = (-cos h, 0, sin h).
//     Steering right => heading decreases.  Models face local +z.
//   * lean > 0 = leaning to the rider's RIGHT (three: rotation.z > 0 with YXZ order).
//   * aLocal = (x: lateral accel toward the rider's right, y: vertical, z: forward), m/s^2.

// ---------- Game / rules ----------
export const GAME = {
  DURATION: 240, // seconds per round
  MAX_PLAYERS: 4,
  STAR_PER_PLAYER: [110, 200, 290] as const, // team tips needed for 1/2/3 stars, multiplied by player count
  SNAP_HZ: 20, // server -> client snapshot rate
  STATE_HZ: 20, // client -> server state rate
} as const;

export const PLAYER_COLORS = [0xe63946, 0x2a7de1, 0xffc93c, 0x2fbf71] as const; // red / blue / yellow / green
export const PLAYER_COLOR_NAMES = ['红', '蓝', '黄', '绿'] as const;

export const ZONE = {
  RADIUS: 5, // pickup / delivery circle radius (m)
  MAX_SPEED: 4, // must be slower than this (m/s) ...
  DWELL: 0.5, // ... for this long (s)
  SERVER_POS_TOLERANCE: 4, // server accepts reported positions this much outside the circle (lag)
  SERVER_SPEED_TOLERANCE: 4, // ... and this much extra speed
  HONK_RADIUS: 30, // noHorn: honking within this distance of the customer wakes the dog
} as const;

export const ORDERS = {
  POOL_BASE: 2, // waiting orders = min(players + POOL_BASE, POOL_MAX)
  POOL_MAX: 6,
  REFILL_DELAY: 3, // s after a pickup / expiry before a new order appears
  WAIT_EXPIRE: 45, // s a waiting order lasts
  ENDED_LINGER: 2, // s an ended (expired / delivered) order stays in the list (card greys out)
  DELIVERY_SPEED: 8, // timeLimit = distance / DELIVERY_SPEED + DELIVERY_SLACK
  DELIVERY_SLACK: 25,
  REQUEST_CHANCE: 0.4,
  RUSH_TIME_MULT: 0.6,
  PIZZA_SIZE: [2, 5] as const, // inclusive
  ICE_SIZE: [2, 3] as const,
  SOUP_SIZE: 1,
} as const;

export const TIP = {
  BASE: 10,
  PER_METER: 0.08,
  PIZZA_PER_EXTRA_BOX: 4,
  ICE_PER_EXTRA_SCOOP: 3,
  INTEGRITY_FLOOR: 0.3, // tip factor = FLOOR + SLOPE * integrity
  INTEGRITY_SLOPE: 0.7,
  EARLY_BONUS: 0.5, // timeMult = 1 + EARLY_BONUS * remainingRatio when on time
  LATE_MULT: 0.5,
  REQ_OK: 8,
  REQ_RUSH_OK: 15,
  REQ_FAIL: -8,
} as const;

// ---------- Map (DESIGN §3) ----------
export const MAP = {
  BLOCKS: 5, // 5 x 5 blocks
  BLOCK: 36, // block edge (m)
  ROAD: 12, // road width (m)
  PITCH: 48, // BLOCK + ROAD
  BUILD_MARGIN: 2, // buildable area is BLOCK/2 - BUILD_MARGIN from block centre
  BUILD_GAP: 3, // gap between buildings inside a block
  BUILD_MIN: 11, // minimum building side (m)
  HEIGHT_MIN: 6,
  HEIGHT_MAX: 30,
  DOOR_INSET: 2, // door marker sits this far into the road, measured from the block edge
  WALL_HEIGHT: 6, // tall enough that a ramp jump can't clear it
  WALL_THICK: 2,
  RESTAURANT_MIN_BLOCK_DIST: 3, // manhattan distance in blocks between restaurants
  CUSTOMER_MIN_SPACING: 26, // metres between customer door points
  CLEARANCE_DOOR: 15, // ramps / bumps / obstacles keep this far away from door points (m)
  RAMP_COUNT: [4, 6] as const,
  BUMP_COUNT: [8, 12] as const,
  OBSTACLE_COUNT: [10, 14] as const,
  RAMP_LEN: 9,
  RAMP_WIDTH: 6,
  RAMP_HEIGHT: 2.6,
  BUMP_WIDTH: 8,
  BUMP_DEPTH: 2.4,
  BUMP_HEIGHT: 0.26,
  TREES: [8, 14] as const,
} as const;

// ---------- Bike (DESIGN §4) ----------
export const BIKE = {
  RADIUS: 0.5,
  MASS: 1,
  VMAX: 16,
  ACCEL: 9,
  BRAKE: 18,
  REVERSE_MAX: 4,
  COAST_DECEL: 2.5, // rolling resistance when no input
  STEER_LOW: 2.2, // rad/s at standstill-ish
  STEER_HIGH: 1.2, // rad/s at vmax
  STEER_MIN_SPEED: 2, // no turning in place: yaw rate scales with clamp(|v| / this, 0, 1)
  GRIP: 8, // lateral velocity decay /s
  GRIP_HANDBRAKE: 2,
  HANDBRAKE_DECEL: 5, // extra longitudinal decel while the handbrake is held
  GRAVITY: 20,
  AIR_STEER: 0.35, // fraction of steering authority while airborne
  GROUND_GRACE: 0.1, // s after leaving the ground before we call it airborne
  AIRBORNE_MIN_LAND: 0.25, // s of air needed to count as a jump landing (stat + landing kick)
  CRASH_TIME: 1.8, // s of lost control
  CRASH_DRAG: 5, // horizontal decel while crashed
  CRASH_IMMUNITY: 1.0, // s after recovering during which walls can't re-crash the bike
  RESET_COOLDOWN: 3, // R key
  WALL_CRASH_SPEED: 7, // wall normal speed above which the bike crashes
  WALL_KICK_MIN: 3, // wall normal speed above which we only apply a big disturbance
  WALL_KICK_GAIN: 1.2, // rad/s of lean velocity per m/s above WALL_KICK_MIN
  WALL_KICK_COOLDOWN: 0.3,
  WALL_REHIT_GAP: 0.2, // s without wall contact before the next touch counts as a fresh impact
  WALL_SCRAPE_MIN: 6.5, // continuous scraping only kicks the lean above this normal speed ...
  WALL_SCRAPE_CRASH: 10, // ... and only crashes above this
  // vertical acceleration low-pass (landing / bump detection)
  ACC_TAU_XZ: 0.05,
  ACC_TAU_Y: 0.12,
  ACC_CLAMP: 1500,
  BUMP_KICK_MIN: 18, // smoothed vertical accel (m/s^2) above which the lean gets kicked
  BUMP_KICK_GAIN: 0.045, // rad/s per m/s^2 above BUMP_KICK_MIN
  LAND_KICK: 0.35, // rad/s per m/s of landing speed
  HIGHSIDE_MIN: 3, // m/s of sideways slide above which releasing the handbrake kicks the lean
  HIGHSIDE_KICK: 1.5, // rad/s of lean velocity per m/s of slide above HIGHSIDE_MIN
  HONK_COOLDOWN: 0.4,
} as const;

// ---------- Lean / balance model (DESIGN §4) ----------
export const BALANCE = {
  G: 9,
  C: 6,
  K_BASE: 4,
  K_SPEED: 26, // K(v) = K_BASE + K_SPEED * clamp(v / K_SPEED_REF, 0, 1)
  K_SPEED_REF: 6,
  K_FEET: 40, // "feet down" stiffness
  FEET_SPEED: 1, // below this speed with no throttle the rider puts a foot down
  TARGET_MAX: 0.5, // rad of lean at full steer
  TARGET_SPEED_REF: 8, // leanTarget scales with clamp(v / this, 0, 1)
  CRASH_LEAN: 1.05, // rad (60 deg)
  LAT_GAIN: 0.32, // lean acceleration per m/s^2 of lateral acceleration (inertia pulls the bike outward)
  NOISE_LEAN: 0.5, // rad: amplitude of the low-speed wobble added to the lean target (fades out by NOISE_SPEED)
  NOISE_SPEED: 4, // wobble fades out by this speed
  NOISE_FEET_MULT: 0.15, // wobble multiplier while feet are down
  MAX_LEAN_VEL: 12,
} as const;

// ---------- Cargo (DESIGN §5) ----------
export const CARGO = {
  SOUP: {
    K: 25,
    C: 2.5,
    GAIN_X: 1.0, // per m/s^2 of lateral accel (design starting value 0.06 was far too weak: retuned)
    GAIN_Z: 0.5, // per m/s^2 of longitudinal accel
    LEAN_G: 9, // lean adds lateral component G*sin(lean)
    SPILL_LIMIT: 0.5,
    SPILL_RATE: 0.4,
    CRASH_MULT: 0.4,
    GAIN_Y: 1.0, // vertical spikes (bumps, landings) rock the surface fore/aft
    Y_FLOOR: 8, // m/s^2 of smoothed vertical accel ignored
    MAX_S: 1.1,
    CRASH_DROPS: 10,
  },
  PIZZA: {
    K: 18,
    C: 3,
    G: 6,
    DRIVE: 0.2, // design starting value 0.03 could never reach the tip limit: retuned
    TIP_LIMIT: 0.35,
    RESET: 0.1,
    LEAN_G: 9,
    MAX_T: 0.9,
  },
  ICE: {
    MELT_TIME: 90, // s to fully melt when moving
    STILL_MULT: 1.5, // melts faster while standing still
    STILL_SPEED: 1,
    IMPACT: 17, // smoothed vertical accel (m/s^2) that knocks off the top scoop (a speed bump taken faster than ~9 m/s, any ramp landing)
    DROP_COOLDOWN: 0.5,
    MELT_PENALTY: 0.7,
    WOBBLE_K: 40,
    WOBBLE_C: 4,
    WOBBLE_GAIN: 0.6,
    LEAN_G: 9,
  },
} as const;

// ---------- Client-only feel / visuals (still tunable, but never used by shared rules) ----------
export const VIEW = {
  CAM_BACK: 5.2,
  CAM_HEIGHT: 2.8,
  CAM_LOOK_AHEAD: 2.6,
  CAM_LOOK_HEIGHT: 1.75, // look target height above the road: just above the cargo rack
  FOV_MIN: 60,
  FOV_MAX: 72,
  CAM_YAW_RATE: 4.5,
  CAM_POS_RATE: 10,
  SHAKE_CRASH: 0.7,
  SHAKE_LAND: 0.25,
  SHAKE_HIT: 0.35,
  DEBRIS_MAX: 40,
  DEBRIS_LIFETIME: 8,
  PARTICLE_MAX: 300,
  PHYSICS_HZ: 60,
  MAX_SUBSTEPS: 30, // physics catch-up per frame (0.5 s); a step costs ~0.1 ms, so the sim stays in real time down to ~2 fps
  MAX_FRAME_DT: 0.5,
  SHADOW_RANGE: 48,
} as const;

/** Visual-only cargo presentation. Never read by the sim or the rules. */
export const CARGO_VIEW = {
  SCALE: 1.4, // size of the cargo on the rack
  WOBBLE_GAIN: 1.6, // exaggeration of the tower offset / tilt, soup surface tilt and scoop sway
} as const;
