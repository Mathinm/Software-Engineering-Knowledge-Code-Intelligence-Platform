import { route } from "@/lib/api";
import { busFactor, dashboardSummary, hotspots, incidentsPerService, recentActivity } from "@/lib/data/insights";

// GET /api/dashboard — all dashboard widgets in one round trip
export const GET = route(async () => {
  const [summary, byService, hot, bus, activity] = await Promise.all([
    dashboardSummary(), incidentsPerService(), hotspots(), busFactor(), recentActivity(),
  ]);
  return { summary, incidentsByService: byService, hotspots: hot, busFactor: bus, activity };
});
