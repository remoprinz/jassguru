import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { cleanupRateLimits } from "./rateLimiter";

/**
 * Scheduled Function für Rate-Limit Cleanup
 * Läuft täglich um 03:00 Uhr (Schweizer Zeit)
 */
export const cleanupRateLimitsScheduled = onSchedule(
  {
    schedule: "0 3 * * *", // Täglich um 03:00 Uhr
    timeZone: "Europe/Zurich",
    region: "europe-west1",
    timeoutSeconds: 300, // 5 Minuten Timeout
    memory: "256MiB",
  },
  async (event) => {
    logger.info("--- cleanupRateLimitsScheduled START ---");

    try {
      await cleanupRateLimits();
      logger.info("--- cleanupRateLimitsScheduled COMPLETED ---");
    } catch (error) {
      logger.error("--- cleanupRateLimitsScheduled ERROR ---", error);
      throw error;
    }
  }
); 