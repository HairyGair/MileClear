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

// Fuel prices
export const FUEL_PRICE_STALENESS_DAYS = 14;
export const FUEL_PRICE_DEFAULT_RADIUS_MILES = 5;
export const FUEL_STATION_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// UK government-mandated retailer fuel price feeds
export const FUEL_RETAILER_FEEDS = [
  { name: "Asda", url: "https://storelocator.asda.com/fuel_prices_data.json" },
  { name: "Esso", url: "https://fuelprices.esso.co.uk/latestdata.json" },
  { name: "JET", url: "https://jetlocal.co.uk/fuel_prices_data.json" },
  { name: "Morrisons", url: "https://www.morrisons.com/fuel-prices/fuel.json" },
  { name: "Moto", url: "https://moto-way.com/fuel-price/fuel_prices.json" },
  { name: "MFG", url: "https://fuel.motorfuelgroup.com/fuel_prices_data.json" },
  { name: "Rontec", url: "https://www.rontec-servicestations.co.uk/fuel-prices/data/fuel_prices_data.json" },
  { name: "Sainsburys", url: "https://api.sainsburys.co.uk/v1/exports/latest/fuel_prices_data.json" },
  { name: "SGN", url: "https://www.sgnretail.uk/files/data/SGN_daily_fuel_prices.json" },
  { name: "Shell", url: "https://www.shell.co.uk/fuel-prices-data.html" },
  { name: "Tesco", url: "https://www.tesco.com/fuel_prices/fuel_prices_data.json" },
  { name: "Ascona", url: "https://fuelprices.asconagroup.co.uk/newfuel.json" },
  { name: "Karan", url: "https://devapi.krlpos.com/integration/live_price/krl" },
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

// Shift statuses
export const SHIFT_STATUSES = ["active", "completed"] as const;

// Trip classifications
export const TRIP_CLASSIFICATIONS = ["business", "personal"] as const;

// Earning sources
export const EARNING_SOURCES = ["manual", "csv", "open_banking", "ocr"] as const;

// Platform tags (values from GIG_PLATFORMS for Zod enum usage)
export const PLATFORM_TAGS = [
  "uber",
  "deliveroo",
  "just_eat",
  "amazon_flex",
  "stuart",
  "gophr",
  "dpd",
  "yodel",
  "evri",
  "other",
] as const;

// Driver type options (waitlist)
export const DRIVER_TYPES = [
  { value: "uber", label: "Uber / Uber Eats" },
  { value: "deliveroo", label: "Deliveroo" },
  { value: "just_eat", label: "Just Eat" },
  { value: "amazon_flex", label: "Amazon Flex" },
  { value: "courier", label: "Courier" },
  { value: "other", label: "Other" },
] as const;

// Gamification — milestones & thresholds
export const MILESTONE_MILES = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000] as const;
export const STREAK_THRESHOLDS = [3, 7, 14, 30] as const;
export const TRIP_COUNT_THRESHOLDS = [10, 50, 100, 500] as const;

// Achievement type identifiers
export const ACHIEVEMENT_TYPES = [
  "first_trip",
  "first_shift",
  "miles_100",
  "miles_500",
  "miles_1000",
  "miles_2500",
  "miles_5000",
  "miles_10000",
  "miles_25000",
  "miles_50000",
  "trips_10",
  "trips_50",
  "trips_100",
  "trips_500",
  "streak_3",
  "streak_7",
  "streak_14",
  "streak_30",
] as const;

export type AchievementType = (typeof ACHIEVEMENT_TYPES)[number];

// Achievement display metadata
export const ACHIEVEMENT_META: Record<
  AchievementType,
  { label: string; description: string; emoji: string }
> = {
  first_trip: { label: "First Trip", description: "Completed your first trip", emoji: "🚗" },
  first_shift: { label: "First Shift", description: "Completed your first shift", emoji: "🏁" },
  miles_100: { label: "Century", description: "Driven 100 miles", emoji: "💯" },
  miles_500: { label: "Road Warrior", description: "Driven 500 miles", emoji: "🛣️" },
  miles_1000: { label: "1K Club", description: "Driven 1,000 miles", emoji: "🏅" },
  miles_2500: { label: "Long Hauler", description: "Driven 2,500 miles", emoji: "🚀" },
  miles_5000: { label: "5K Legend", description: "Driven 5,000 miles", emoji: "⭐" },
  miles_10000: { label: "10K Champion", description: "Driven 10,000 miles", emoji: "🏆" },
  miles_25000: { label: "25K Elite", description: "Driven 25,000 miles", emoji: "👑" },
  miles_50000: { label: "50K Master", description: "Driven 50,000 miles", emoji: "💎" },
  trips_10: { label: "Getting Started", description: "Completed 10 trips", emoji: "📍" },
  trips_50: { label: "Regular", description: "Completed 50 trips", emoji: "📌" },
  trips_100: { label: "Century Rider", description: "Completed 100 trips", emoji: "🎯" },
  trips_500: { label: "Road Master", description: "Completed 500 trips", emoji: "🗺️" },
  streak_3: { label: "Hat Trick", description: "3-day driving streak", emoji: "🔥" },
  streak_7: { label: "Week Warrior", description: "7-day driving streak", emoji: "🔥" },
  streak_14: { label: "Fortnight Force", description: "14-day driving streak", emoji: "🔥" },
  streak_30: { label: "Monthly Machine", description: "30-day driving streak", emoji: "🔥" },
};
