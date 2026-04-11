import { prisma } from "../lib/prisma.js";

export async function runJob(
  jobName: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  let runId: string | null = null;
  try {
    const run = await prisma.jobRun.create({
      data: { jobName, status: "running" },
      select: { id: true },
    });
    runId = run.id;
  } catch (err) {
    console.error(`[runJob] Failed to create JobRun row for ${jobName}:`, err);
  }

  try {
    const result = await fn();
    if (runId) {
      try {
        await prisma.jobRun.update({
          where: { id: runId },
          data: {
            finishedAt: new Date(),
            status: "success",
            metadata:
              result && typeof result === "object"
                ? JSON.stringify(result).slice(0, 10000)
                : null,
          },
        });
      } catch (err) {
        console.error(`[runJob] Failed to mark ${jobName} success:`, err);
      }
    }
  } catch (err) {
    const errorMessage =
      err instanceof Error
        ? `${err.name}: ${err.message}\n${err.stack ?? ""}`.slice(0, 10000)
        : String(err).slice(0, 10000);
    console.error(`[runJob] ${jobName} failed:`, err);
    if (runId) {
      try {
        await prisma.jobRun.update({
          where: { id: runId },
          data: {
            finishedAt: new Date(),
            status: "error",
            errorMessage,
          },
        });
      } catch (updateErr) {
        console.error(`[runJob] Failed to mark ${jobName} error:`, updateErr);
      }
    }
  }
}
