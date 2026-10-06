// "You asked, we built" (feedback redesign, 6 Oct 2026). Ideas are public only
// once the admin has picked them up (planned / in progress) or built them
// (done). Problem reports (category bug_report) are never public: new ones go
// to the private Inbox, and the old ones stay hidden. Until then an idea is
// visible to its author alone.

export const PUBLIC_IDEA_STATUSES = ["planned", "in_progress", "done"] as const;

export interface BoardItemLike {
  userId: string | null;
  category: string;
  status: string;
  createdAt: Date;
  shippedAt: Date | null;
}

export function isPublicIdea(item: { category: string; status: string }): boolean {
  return item.category !== "bug_report" && (PUBLIC_IDEA_STATUSES as readonly string[]).includes(item.status);
}

/** Pure: sorts items into the three board sections. */
export function buildBoard<T extends BoardItemLike>(
  items: T[],
  userId: string | null,
  builtLimit = 30
): { onTheList: T[]; built: T[]; mine: T[] } {
  const byNewest = (a: T, b: T) => b.createdAt.getTime() - a.createdAt.getTime();
  const shippedTime = (t: T) => (t.shippedAt ?? t.createdAt).getTime();
  const onTheList = items
    .filter((i) => isPublicIdea(i) && i.status !== "done")
    .sort(byNewest);
  const built = items
    .filter((i) => isPublicIdea(i) && i.status === "done")
    .sort((a, b) => shippedTime(b) - shippedTime(a))
    .slice(0, builtLimit);
  const mine = userId
    ? items.filter((i) => i.userId === userId && i.category !== "bug_report").sort(byNewest)
    : [];
  return { onTheList, built, mine };
}

/**
 * Prisma filter for the old GET /feedback list (older apps): public ideas plus
 * the caller's own ideas. Admins see everything.
 */
export function legacyListVisibility(userId: string | null, isAdmin: boolean): Record<string, unknown> {
  if (isAdmin) return {};
  const visible: Record<string, unknown>[] = [{ status: { in: [...PUBLIC_IDEA_STATUSES] } }];
  if (userId) visible.push({ userId });
  return { AND: [{ category: { not: "bug_report" } }, { OR: visible }] };
}
