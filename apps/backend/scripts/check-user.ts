import { getDb } from "../src/lib/mongodb";

async function main() {
    const db = await getDb();
    const users = await db.collection("users")
        .find({})
        .sort({ updated_at: -1 })
        .limit(10)
        .project({
            email: 1,
            full_name: 1,
            role: 1,
            auth0UserId: 1,
            welcome_email_sent: 1,
            verification_email_sent: 1,
            created_at: 1,
            updated_at: 1,
        })
        .toArray();

    console.log("Found recent users in MongoDB:");
    console.log(JSON.stringify(users, null, 2));
}

main().catch(err => {
    console.error("Error checking users:", err);
    process.exit(1);
});
