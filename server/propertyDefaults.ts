import { storage } from "./storage";

const DEFAULT_SETTINGS = [
  { key: "large_party_surcharge_amount", value: "20", description: "Additional fee for parties at or above the minimum size" },
  { key: "large_party_min_size", value: "4", description: "Minimum number of travelers to trigger the large party surcharge" },
  { key: "tax_percentage", value: "0", description: "Tax percentage applied to all bookings" },
  { key: "stripe_environment", value: "sandbox", description: "Stripe environment: sandbox or live" },
];

const DEFAULT_TEMPLATES = [
  {
    templateKey: "booking_confirmation",
    name: "Booking Confirmation",
    subject: "Booking Confirmation - {{referenceNumber}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h1 style="color: #1a1a2e;">Booking Confirmation</h1><p>Dear {{customerName}},</p><p>Thank you for your booking! Here are your details:</p><div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;"><p><strong>Reference Number:</strong> {{referenceNumber}}</p><p><strong>Pickup Date:</strong> {{pickupDate}}</p><p><strong>Pickup Time:</strong> {{pickupTime}}</p><p><strong>Pickup Location:</strong> {{pickupLocation}}</p><p><strong>Dropoff Location:</strong> {{dropoffLocation}}</p><p><strong>Passengers:</strong> {{passengers}}</p><p><strong>Total:</strong> {{totalAmount}}</p></div><p>If you have any questions, please reply to this email.</p></div>`,
    triggerDescription: "Sent when a customer completes a booking",
    recipientType: "customer",
    availableVariables: ["customerName", "referenceNumber", "pickupDate", "pickupTime", "pickupLocation", "dropoffLocation", "passengers", "tripPrice", "taxAmount", "totalAmount"],
  },
  {
    templateKey: "quote_notification",
    name: "Quote Ready",
    subject: "Your Quote is Ready - Booking {{referenceNumber}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h1>Your Quote is Ready</h1><p>Dear {{customerName}},</p><p>We've prepared a quote for your transfer:</p><div style="background: #f5f5f5; padding: 20px; border-radius: 8px;"><p><strong>Reference:</strong> {{referenceNumber}}</p><p><strong>Booking Fee:</strong> $\{{bookingFee}}</p><p><strong>Driver Fee:</strong> $\{{driverFee}}</p><p><strong>Total:</strong> $\{{totalAmount}}</p></div></div>`,
    triggerDescription: "Sent when admin sets pricing for destination bookings",
    recipientType: "customer",
    availableVariables: ["customerName", "referenceNumber", "bookingFee", "driverFee", "totalAmount"],
  },
  {
    templateKey: "payment_link",
    name: "Payment Link",
    subject: "Payment Required - Booking {{referenceNumber}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h1>Payment Required</h1><p>Dear {{customerName}},</p><p>Please complete your payment to confirm your transfer.</p><div style="background: #f5f5f5; padding: 20px; border-radius: 8px;"><p><strong>Reference:</strong> {{referenceNumber}}</p><p><strong>Total:</strong> $\{{totalAmount}}</p></div><div style="text-align: center; margin: 30px 0;"><a href="{{paymentLink}}" style="background: #4f46e5; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Pay Now</a></div></div>`,
    triggerDescription: "Sent when admin generates payment link",
    recipientType: "customer",
    availableVariables: ["customerName", "referenceNumber", "totalAmount", "paymentLink"],
  },
  {
    templateKey: "payment_confirmation",
    name: "Payment Confirmation",
    subject: "Payment Confirmed - Booking {{referenceNumber}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h1 style="color: #22c55e;">Payment Confirmed!</h1><p>Dear {{customerName}},</p><p>Thank you! Your payment has been processed.</p><div style="background: #f5f5f5; padding: 20px; border-radius: 8px;"><p><strong>Reference:</strong> {{referenceNumber}}</p><p><strong>Pickup Date:</strong> {{pickupDate}}</p><p><strong>Pickup Time:</strong> {{pickupTime}}</p><p><strong>Pickup Location:</strong> {{pickupLocation}}</p><p><strong>Dropoff Location:</strong> {{dropoffLocation}}</p><p><strong>Amount Paid:</strong> $\{{totalAmount}}</p></div></div>`,
    triggerDescription: "Sent when customer completes payment via Stripe",
    recipientType: "customer",
    availableVariables: ["customerName", "referenceNumber", "pickupDate", "pickupTime", "pickupLocation", "dropoffLocation", "totalAmount"],
  },
  {
    templateKey: "driver_assignment",
    name: "Driver Assignment",
    subject: "New Trip Assignment - {{referenceNumber}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h1>New Trip Assignment</h1><p>Dear {{driverName}},</p><div style="background: #f5f5f5; padding: 20px; border-radius: 8px;"><p><strong>Reference:</strong> {{referenceNumber}}</p><p><strong>Pickup Date:</strong> {{pickupDate}}</p><p><strong>Pickup Time:</strong> {{pickupTime}}</p><p><strong>Pickup:</strong> {{pickupLocation}}</p><p><strong>Dropoff:</strong> {{dropoffLocation}}</p><p><strong>Flight:</strong> {{flightNumber}}</p><p><strong>Vehicle:</strong> {{vehicleClass}}</p><p><strong>Party:</strong> {{partySize}}</p><p><strong>Customer:</strong> {{customerName}} ({{customerPhone}})</p><p><strong>Your Fee:</strong> $\{{driverFee}}</p></div></div>`,
    triggerDescription: "Sent to driver when assigned to a booking",
    recipientType: "driver",
    availableVariables: ["driverName", "referenceNumber", "pickupDate", "pickupTime", "pickupLocation", "dropoffLocation", "flightNumber", "vehicleClass", "partySize", "customerName", "customerPhone", "driverFee"],
  },
  {
    templateKey: "driver_assigned_customer",
    name: "Driver Assigned (Customer)",
    subject: "Your Driver Has Been Assigned - Booking {{referenceNumber}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h1>Your Driver Has Been Assigned</h1><p>Dear {{customerName}},</p><div style="background: #f5f5f5; padding: 20px; border-radius: 8px;"><p><strong>Reference:</strong> {{referenceNumber}}</p><p><strong>Driver:</strong> {{driverName}}</p><p><strong>Pickup Date:</strong> {{pickupDate}}</p><p><strong>Pickup:</strong> {{pickupLocation}}</p><p><strong>Dropoff:</strong> {{dropoffLocation}}</p></div></div>`,
    triggerDescription: "Sent to customer when a driver is assigned",
    recipientType: "customer",
    availableVariables: ["customerName", "referenceNumber", "driverName", "pickupDate", "pickupLocation", "dropoffLocation"],
  },
];

export async function seedPropertyDefaults(propertyId: string) {
  // Settings
  for (const s of DEFAULT_SETTINGS) {
    const existing = await storage.getSetting(s.key, propertyId);
    if (!existing) {
      await storage.upsertSetting({ ...s, propertyId });
    }
  }
  // Email templates
  const existingTemplates = await storage.getAllEmailTemplates(propertyId);
  const byKey = new Map(existingTemplates.map((t) => [t.templateKey, t]));
  for (const t of DEFAULT_TEMPLATES) {
    if (!byKey.has(t.templateKey)) {
      await storage.createEmailTemplate({ ...t, propertyId });
    }
  }
}
