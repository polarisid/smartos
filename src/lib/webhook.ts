import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export async function triggerWebhook(payload: Record<string, unknown>) {
    try {
        const configDoc = await getDoc(doc(db, "configs", "webhook"));
        if (!configDoc.exists()) {
            console.log("Webhook URL not configured.");
            return;
        }
        const webhookUrl = configDoc.data().url as string;
        if (!webhookUrl) {
            console.log("Webhook URL is empty.");
            return;
        }

        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } catch (error) {
        console.error("Failed to trigger webhook:", error);
        // Do not block user flow, just log the error
    }
}
