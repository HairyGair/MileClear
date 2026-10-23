// UK-only jobs and pushes (23 Oct 2026). A driver outside the UK (users.country,
// see shared featuresFor) gets no HMRC tax reminders, Self Assessment or MTD
// pushes, MOT or Clean Air Zone reminders, UK fuel prices or road alerts.
// Add UK_ONLY_USER to the user `where` of any such job; every driver before
// the Country setting is GB, so they keep everything.
import { UK_COUNTRY_CODES } from "@mileclear/shared";

/** Prisma `where` on User: the driver drives in the UK. */
export const UK_ONLY_USER = { country: { in: [...UK_COUNTRY_CODES] } };
