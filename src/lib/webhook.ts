import { configService } from "@/services/supabase/configService";

export async function triggerWebhook(payload: Record<string, unknown>) {
    try {
        const webhookUrl = await configService.getWebhookUrl();
        if (!webhookUrl) {
            console.log("Webhook URL not configured or empty.");
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
