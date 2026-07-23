const { Resend } = require('resend');

// Initialize Resend with the key from your environment variables
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Sends notification emails directly to your admin inbox.
 */
async function sendNotificationEmail(subject, htmlContent) {
    try {
        const data = await resend.emails.send({
            from: 'Aura De Scents <onboarding@resend.dev>',
            to: process.env.NOTIFICATION_EMAIL,
            subject: subject,
            html: htmlContent,
        });

        console.log('Notification email dispatched:', data);
        return { success: true, data };
    } catch (error) {
        // Log the error so failures never block database commits or frontend responses
        console.error('Failed to send email notification:', error);
        return { success: false, error };
    }
}

module.exports = { sendNotificationEmail };