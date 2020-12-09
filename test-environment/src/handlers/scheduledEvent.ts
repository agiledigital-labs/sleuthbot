import type { ScheduledHandler } from "aws-lambda";
import { env } from "process";

export const scheduled: ScheduledHandler = async (_, _context) => {
  if (env.ERROR === "true") {
    console.error("Something looks wrong");
  }
  console.info("Yay!");
};
