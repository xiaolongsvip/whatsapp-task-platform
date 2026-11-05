const { randomBytes } = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function makeCode() {
  const bytes = randomBytes(5);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, referralCode: true },
    orderBy: { createdAt: "asc" },
  });
  const pending = users.filter((user) => !/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/.test(user.referralCode));
  console.log(`Total users: ${users.length}`);
  console.log(`Codes to shorten: ${pending.length}`);
  if (pending.length === 0) {
    console.log("All referral codes already use the five-character format.");
    return;
  }

  const reserved = new Set(users.map((user) => user.referralCode));
  const changes = pending.map((user) => {
    let code;
    do { code = makeCode(); } while (reserved.has(code));
    reserved.add(code);
    return { id: user.id, oldCode: user.referralCode, newCode: code };
  });

  console.log("Preview (first 10):");
  for (const item of changes.slice(0, 10)) {
    console.log(`  ${item.oldCode} -> ${item.newCode}`);
  }

  if (!process.argv.includes("--apply")) {
    console.log("\nDry run only. Re-run with --apply to update the database.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const item of changes) {
      await tx.user.update({
        where: { id: item.id },
        data: { referralCode: item.newCode },
      });
    }
  }, { timeout: 120000 });

  console.log(`Updated ${changes.length} referral codes successfully.`);
  console.log("Referral relationships remain unchanged because they reference user IDs.");
  console.log("Previously distributed links containing old codes will no longer resolve.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
