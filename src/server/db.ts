import { PrismaClient } from "@prisma/client"

/**
 * A single Prisma client across hot reloads. Next.js re-evaluates modules in
 * development, and a new client per reload exhausts the connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

/**
 * The workspace owner.
 *
 * The slice has no login, but every project already hangs off a User row, so
 * adding Auth.js later means replacing this function rather than migrating the
 * schema.
 */
export async function currentUser() {
  const email = process.env.DEV_USER_EMAIL ?? "you@localhost"

  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "You" },
  })
}
