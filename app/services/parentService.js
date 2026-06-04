const bookingRepository = require('../repository/bookingsRepository');
const notificationRepository = require('../repository/notificationRepository');
const notificationService = require('../services/notificationService');
const driverRepository = require('../repository/driverRepository');

class ParentService {
    async assignDriverToBookingService(bookingId, driverId) {
        if (!bookingId || !driverId) {
            return this.createResponse(false, 'Booking ID and Driver ID are required');
        }

        const booking = await bookingRepository.getBookingById(bookingId);
        if (!booking) {
            return this.createResponse(false, 'Booking not found', { bookingId });
        }

        if(booking.driverId){
            return this.createResponse(true, 'Driver already assigned to booking', { booking });
        }

        const driver = await driverRepository.getDriverById(driverId);
        if (!driver) {
            return this.createResponse(false, 'Driver not found', { driverId });
        }

        const book = await bookingRepository.assignDriverToBooking(bookingId, driverId);
        if (!book) {
            return this.createResponse(false, 'Failed to assign driver to booking', { bookingId, driverId });
        }

        const deviceToken = await notificationRepository.GetDeviceToken(driver.userId);
        if(deviceToken.length > 0 && deviceToken[0].deviceToken){
            await notificationService.sendNotification(
                deviceToken[0].deviceToken,
                'New Booking Assignment',
                `You have been assigned to booking #${bookingId}. Please check your schedule.`
            );
        }
        
        return this.createResponse(true, 'Driver assigned to booking successfully', { booking });
    }

    createResponse(success, message, data = null) {
        return {
            success,
            message,
            data
        };
    }
}

module.exports = new ParentService();

