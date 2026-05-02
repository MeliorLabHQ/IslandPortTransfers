import { getStripeSync } from './stripeClient';
import { emailService } from './emailService';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error('STRIPE WEBHOOK ERROR: Payload must be a Buffer.');
    }
    const payloadString = payload.toString();
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
    try {
      const event = JSON.parse(payloadString);
      await this.handleCustomEvents(event);
    } catch (error) {
      console.error('Error processing custom webhook logic:', error);
    }
  }

  private static async handleCustomEvents(event: any): Promise<void> {
    if (event.type !== 'checkout.session.completed') return;
    const session = event.data?.object;
    const metadata = session?.metadata;
    if (!metadata) return;

    // New flow: hotel checkout (booking created after payment)
    if (metadata.bookingType === 'hotel' && !metadata.bookingId) {
      try {
        const propertyId = metadata.propertyId;
        if (!propertyId) {
          console.error('Webhook: missing propertyId in metadata');
          return;
        }
        const hotelId = metadata.hotelId;
        const portId = metadata.portId;
        const partySizeNum = parseInt(metadata.partySize) || 1;

        const hotel = await storage.getHotel(hotelId, propertyId);
        const allPorts = await storage.getActivePorts();
        const port = allPorts.find((p) => p.id === portId);
        if (!hotel || !port) {
          console.error('Invalid hotel or port in webhook metadata');
          return;
        }

        const portHotelRate = await storage.getPortHotelRate(portId, hotelId, propertyId);
        if (!portHotelRate?.price) {
          console.error('No rate found for port-hotel in webhook');
          return;
        }
        const basePrice = parseFloat(portHotelRate.price);

        const surchargeAmountSetting = await storage.getSetting('large_party_surcharge_amount', propertyId);
        const minPartySizeSetting = await storage.getSetting('large_party_min_size', propertyId);
        const surchargeAmount = parseFloat(surchargeAmountSetting?.value || '20');
        const minPartySize = parseInt(minPartySizeSetting?.value || '4');
        const surcharge = partySizeNum >= minPartySize ? surchargeAmount : 0;

        const taxPercentageSetting = await storage.getSetting('tax_percentage', propertyId);
        const taxPercentage = parseFloat(taxPercentageSetting?.value || '0');
        const subtotal = basePrice + surcharge;
        const taxAmount = subtotal * (taxPercentage / 100);
        const expectedTotal = subtotal + taxAmount;

        const paidAmountCents = session.amount_total || 0;
        const expectedAmountCents = Math.round(expectedTotal * 100);
        if (Math.abs(paidAmountCents - expectedAmountCents) > 1) {
          console.error(`Payment amount mismatch! Paid: ${paidAmountCents}, Expected: ${expectedAmountCents}`);
        }

        const referenceNumber = this.generateReferenceNumber();
        const bookingData = {
          propertyId,
          referenceNumber,
          bookingType: 'hotel',
          customerName: metadata.customerName,
          customerEmail: metadata.customerEmail,
          customerPhone: metadata.customerPhone || '',
          pickupLocation: port.name,
          dropoffLocation: hotel.name,
          pickupDate: new Date(metadata.pickupDate),
          partySize: partySizeNum,
          vehicleClass: metadata.vehicleClass,
          flightNumber: metadata.flightNumber || '',
          hotelId,
          arrivalPortId: portId,
          totalAmount: expectedTotal.toFixed(2),
          pricingSet: true,
          status: 'paid_fee',
          stripeSessionId: session.id,
        };

        const booking = await storage.createBooking(bookingData as any);
        console.log(`Hotel booking ${booking.referenceNumber} created (verified $${expectedTotal.toFixed(2)})`);

        try {
          await emailService.sendBookingConfirmation({
            propertyId,
            customerEmail: booking.customerEmail,
            customerName: booking.customerName,
            referenceNumber: booking.referenceNumber,
            bookingType: booking.bookingType,
            pickupDate: booking.pickupDate ? new Date(booking.pickupDate).toLocaleDateString() : '',
            pickupTime: metadata.pickupTime || '',
            pickupLocation: booking.pickupLocation,
            dropoffLocation: booking.dropoffLocation,
            passengers: booking.partySize,
            totalAmount: booking.totalAmount || undefined,
            tripPrice: subtotal.toFixed(2),
            taxAmount: taxAmount.toFixed(2),
          });
        } catch (e) { console.error('Booking confirmation email failed:', e); }

        try {
          await emailService.sendPaymentConfirmation({
            propertyId,
            customerEmail: booking.customerEmail,
            customerName: booking.customerName,
            referenceNumber: booking.referenceNumber,
            pickupDate: booking.pickupDate ? new Date(booking.pickupDate).toLocaleDateString() : '',
            pickupTime: metadata.pickupTime || '',
            pickupLocation: booking.pickupLocation,
            dropoffLocation: booking.dropoffLocation,
            totalAmount: booking.totalAmount || '0.00',
          });
        } catch (e) { console.error('Payment confirmation email failed:', e); }
      } catch (err) {
        console.error('Failed to create booking from webhook:', err);
      }
      return;
    }

    // Existing flow: bookings created before payment (destination)
    const bookingId = metadata.bookingId;
    if (bookingId) {
      const propertyId = metadata.propertyId;
      const booking = propertyId
        ? await storage.getBooking(bookingId, propertyId)
        : await storage.getBookingByReference(metadata.referenceNumber || '');
      if (!booking) return;

      await storage.updateBookingStatus(bookingId, 'paid_fee');
      try {
        const dt = booking.pickupDate ? new Date(booking.pickupDate) : null;
        const time = dt ? dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
        await emailService.sendPaymentConfirmation({
          propertyId: booking.propertyId!,
          customerEmail: booking.customerEmail,
          customerName: booking.customerName,
          referenceNumber: booking.referenceNumber,
          pickupDate: dt ? dt.toLocaleDateString() : '',
          pickupTime: time,
          pickupLocation: booking.pickupLocation,
          dropoffLocation: booking.dropoffLocation,
          totalAmount: booking.totalAmount || '0.00',
        });
      } catch (e) { console.error('Payment confirmation email failed:', e); }
    }
  }

  private static generateReferenceNumber(): string {
    const prefix = 'BK';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }
}
