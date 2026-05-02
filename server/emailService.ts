import { getUncachableResendClient } from './resendClient';
import { storage } from './storage';

function replaceVariables(template: string, variables: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, String(value));
  }
  return result;
}

interface BaseBookingEmail {
  propertyId: string;
}

export class EmailService {
  private async send(opts: { propertyId: string; to: string; templateKey: string; variables: Record<string, string | number>; fallbackSubject: string; fallbackHtml: string }) {
    const { client, fromEmail } = await getUncachableResendClient();
    const property = await storage.getProperty(opts.propertyId);
    const senderName = property?.name || 'Airport Transfers';
    const from = fromEmail.includes('<') ? fromEmail : `${senderName} <${fromEmail}>`;

    const template = await storage.getEmailTemplateByKey(opts.templateKey, opts.propertyId);
    let subject: string;
    let html: string;
    if (template && template.isActive) {
      subject = replaceVariables(template.subject, opts.variables);
      html = replaceVariables(template.body, opts.variables);
    } else {
      subject = opts.fallbackSubject;
      html = opts.fallbackHtml;
    }

    const { data, error } = await client.emails.send({ from, to: opts.to, subject, html });
    if (error) {
      console.error(`Failed to send ${opts.templateKey}:`, error);
      throw error;
    }
    return data;
  }

  async sendBookingConfirmation(b: BaseBookingEmail & {
    customerEmail: string; customerName: string; referenceNumber: string; bookingType: string;
    pickupDate: string; pickupTime: string; pickupLocation: string; dropoffLocation: string;
    passengers: number; totalAmount?: string; tripPrice?: string; taxAmount?: string;
  }) {
    const isHotel = b.bookingType === 'hotel';
    let priceBreakdown: string;
    if (!isHotel) priceBreakdown = 'Quote pending - we will contact you shortly';
    else if (b.tripPrice && b.taxAmount && parseFloat(b.taxAmount) > 0) {
      priceBreakdown = `Trip: $${parseFloat(b.tripPrice).toFixed(2)} + Tax: $${parseFloat(b.taxAmount).toFixed(2)} = Total: $${parseFloat(b.totalAmount || '0').toFixed(2)}`;
    } else {
      priceBreakdown = `$${parseFloat(b.totalAmount || '30.00').toFixed(2)}`;
    }
    return this.send({
      propertyId: b.propertyId,
      to: b.customerEmail,
      templateKey: 'booking_confirmation',
      variables: {
        customerName: b.customerName, referenceNumber: b.referenceNumber,
        pickupDate: b.pickupDate, pickupTime: b.pickupTime,
        pickupLocation: b.pickupLocation, dropoffLocation: b.dropoffLocation,
        passengers: b.passengers, totalAmount: priceBreakdown,
        tripPrice: b.tripPrice ? `$${parseFloat(b.tripPrice).toFixed(2)}` : '',
        taxAmount: b.taxAmount ? `$${parseFloat(b.taxAmount).toFixed(2)}` : '$0.00',
      },
      fallbackSubject: `Booking Confirmation - ${b.referenceNumber}`,
      fallbackHtml: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;"><h1>Booking Confirmation</h1><p>Dear ${b.customerName},</p><p>Reference: <strong>${b.referenceNumber}</strong></p><p>Pickup: ${b.pickupDate} ${b.pickupTime} from ${b.pickupLocation}</p><p>Dropoff: ${b.dropoffLocation}</p><p>Total: ${priceBreakdown}</p></div>`,
    });
  }

  async sendPaymentLink(b: BaseBookingEmail & {
    customerEmail: string; customerName: string; referenceNumber: string; totalAmount: string; paymentLink: string;
  }) {
    return this.send({
      propertyId: b.propertyId,
      to: b.customerEmail,
      templateKey: 'payment_link',
      variables: { customerName: b.customerName, referenceNumber: b.referenceNumber, totalAmount: b.totalAmount, paymentLink: b.paymentLink },
      fallbackSubject: `Payment Required - Booking ${b.referenceNumber}`,
      fallbackHtml: `<p>Dear ${b.customerName},</p><p>Reference: ${b.referenceNumber}</p><p>Total: $${b.totalAmount}</p><p><a href="${b.paymentLink}">Pay Now</a></p>`,
    });
  }

  async sendQuoteNotification(b: BaseBookingEmail & {
    customerEmail: string; customerName: string; referenceNumber: string;
    bookingFee: string; driverFee: string; totalAmount: string;
  }) {
    return this.send({
      propertyId: b.propertyId,
      to: b.customerEmail,
      templateKey: 'quote_notification',
      variables: { customerName: b.customerName, referenceNumber: b.referenceNumber, bookingFee: b.bookingFee, driverFee: b.driverFee, totalAmount: b.totalAmount },
      fallbackSubject: `Your Quote is Ready - Booking ${b.referenceNumber}`,
      fallbackHtml: `<p>Dear ${b.customerName},</p><p>Reference: ${b.referenceNumber}</p><p>Total: $${b.totalAmount}</p>`,
    });
  }

  async sendPaymentConfirmation(b: BaseBookingEmail & {
    customerEmail: string; customerName: string; referenceNumber: string; pickupDate: string;
    pickupTime?: string; pickupLocation: string; dropoffLocation: string; totalAmount: string;
  }) {
    return this.send({
      propertyId: b.propertyId,
      to: b.customerEmail,
      templateKey: 'payment_confirmation',
      variables: {
        customerName: b.customerName, referenceNumber: b.referenceNumber,
        pickupDate: b.pickupDate, pickupTime: b.pickupTime || '',
        pickupLocation: b.pickupLocation, dropoffLocation: b.dropoffLocation, totalAmount: b.totalAmount,
      },
      fallbackSubject: `Payment Confirmed - ${b.referenceNumber}`,
      fallbackHtml: `<p>Dear ${b.customerName},</p><p>Payment confirmed for ${b.referenceNumber}. Total: $${b.totalAmount}</p>`,
    });
  }

  async sendDriverAssignment(driver: { driverEmail: string; driverName: string }, b: BaseBookingEmail & {
    referenceNumber: string; customerName: string; customerPhone: string; pickupDate: string;
    pickupTime?: string; pickupLocation: string; dropoffLocation: string; partySize: number;
    flightNumber: string; vehicleClass: string; driverFee: string;
  }) {
    return this.send({
      propertyId: b.propertyId,
      to: driver.driverEmail,
      templateKey: 'driver_assignment',
      variables: {
        driverName: driver.driverName, referenceNumber: b.referenceNumber,
        customerName: b.customerName, customerPhone: b.customerPhone,
        pickupDate: b.pickupDate, pickupTime: b.pickupTime || '',
        pickupLocation: b.pickupLocation, dropoffLocation: b.dropoffLocation,
        partySize: b.partySize, flightNumber: b.flightNumber, vehicleClass: b.vehicleClass, driverFee: b.driverFee,
      },
      fallbackSubject: `New Trip Assignment - ${b.referenceNumber}`,
      fallbackHtml: `<p>Dear ${driver.driverName},</p><p>New trip ${b.referenceNumber}</p>`,
    });
  }

  async sendDriverAssignmentToCustomer(b: BaseBookingEmail & {
    customerEmail: string; customerName: string; referenceNumber: string;
    driverName: string; pickupDate: string; pickupLocation: string; dropoffLocation: string;
  }) {
    return this.send({
      propertyId: b.propertyId,
      to: b.customerEmail,
      templateKey: 'driver_assigned_customer',
      variables: {
        customerName: b.customerName, referenceNumber: b.referenceNumber,
        driverName: b.driverName, pickupDate: b.pickupDate,
        pickupLocation: b.pickupLocation, dropoffLocation: b.dropoffLocation,
      },
      fallbackSubject: `Driver Assigned - ${b.referenceNumber}`,
      fallbackHtml: `<p>Dear ${b.customerName},</p><p>${b.driverName} has been assigned for ${b.referenceNumber}</p>`,
    });
  }
}

export const emailService = new EmailService();
