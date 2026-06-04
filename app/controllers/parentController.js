const ParentService = require('../services/parentService');

class ParentController {
    async asignDriver(req, res) {
        try {
            const { bookingId, driverId } = req.body;
            const result = await ParentService.assignDriverToBookingService(bookingId, driverId);

            // Missing required fields - Bad Request (400)
            if (!result.success && (!bookingId || !driverId)) {
                return res.status(400).json(result);
            }

            // Not found scenarios - Not Found (404)
            if (!result.success && result.message.includes('not found')) {
                return res.status(404).json(result);
            }

            // Other failures - Bad Request (400)
            if (!result.success) {
                return res.status(400).json(result);
            }

            return res.status(200).json(result);
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: error.message
            });
        }
    }
}

module.exports = new ParentController();
