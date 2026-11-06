import { connectDb } from "@/lib/db";
import { adminRoute } from "@/lib/auth/adminRoute";
import { ok } from "@/lib/http";
import { MediaUpload, Message, Report, User } from "@/models";

/** Irányítópult: kizárólag számok (tartalom és felhasználóhoz köthető üzenetadat nélkül). */
export const GET = adminRoute(async () => {
  await connectDb();
  const day = 24 * 3600 * 1000;
  const since7 = new Date(Date.now() - 7 * day);
  const since24 = new Date(Date.now() - day);
  const [users, active7d, openReports, pendingDeletion, messages24h, mediaCount, signups] = await Promise.all([
    User.countDocuments({ status: { $ne: "purged" } }),
    User.countDocuments({ lastSeenAt: { $gte: since7 } }),
    Report.countDocuments({ status: "open" }),
    User.countDocuments({ status: "deleted_pending" }),
    Message.countDocuments({ createdAt: { $gte: since24 } }),
    MediaUpload.countDocuments({}),
    User.aggregate<{ _id: string; n: number }>([
      { $match: { createdAt: { $gte: since7 } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  return ok({ users, active7d, openReports, pendingDeletion, messages24h, mediaCount, signups: signups.map((s) => ({ day: s._id, count: s.n })) });
});
