// HMRC simplified mileage rates (pence per mile)
export const HMRC_RATES = {
  car: {
    first10000: 45,
    after10000: 25,
  },
  van: {
    first10000: 45,
    after10000: 25,
  },
  motorbike: {
    flat: 24,
  },
} as const;

export const HMRC_THRESHOLD_MILES = 10_000;

// Auth
export const ACCESS_TOKEN_EXPIRY = "15m";
export const REFRESH_TOKEN_EXPIRY_DAYS = 30;
export const BCRYPT_SALT_ROUNDS = 12;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MINUTES = 15;

// Tracking
export const TRACKING_INTERVAL_METERS = 50;
export const STOP_DETECTION_MINUTES = 2;
export const DRIVING_SPEED_THRESHOLD_MPH = 15;

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Subscription
export const PREMIUM_PRICE_MONTHLY_PENCE = 499;

// Platform tags
export const GIG_PLATFORMS = [
  { value: "uber", label: "Uber / Uber Eats" },
  { value: "deliveroo", label: "Deliveroo" },
  { value: "just_eat", label: "Just Eat" },
  { value: "amazon_flex", label: "Amazon Flex" },
  { value: "stuart", label: "Stuart" },
  { value: "gophr", label: "Gophr" },
  { value: "dpd", label: "DPD" },
  { value: "yodel", label: "Yodel" },
  { value: "evri", label: "Evri" },
  { value: "other", label: "Other" },
] as const;

// Fuel brands
export const FUEL_BRANDS = [
  "Shell",
  "BP",
  "Esso",
  "Tesco",
  "Sainsbury's",
  "Asda",
  "Morrisons",
  "Texaco",
  "Gulf",
  "Jet",
] as const;

// Vehicle fuel types
export const FUEL_TYPES = ["petrol", "diesel", "electric", "hybrid"] as const;

// Vehicle types
export const VEHICLE_TYPES = ["car", "motorbike", "van"] as const;

// Driver type options (waitlist)
export const DRIVER_TYPES = [
  { value: "uber", label: "Uber / Uber Eats" },
  { value: "deliveroo", label: "Deliveroo" },
  { value: "just_eat", label: "Just Eat" },
  { value: "amazon_flex", label: "Amazon Flex" },
  { value: "courier", label: "Courier" },
  { value: "other", label: "Other" },
] as const;
