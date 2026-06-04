const bookingRepository = require('../repository/bookingsRepository');
const driverRepository = require('../repository/driverRepository'); 
const parentRepository = require('../repository/parentsRepository');
const notificationRepository = require('../repository/notificationRepository');
const notificationService = require('../services/notificationService');
const taxiCompanyRepository = require('../repository/taxiCompanyRepository');
const scheduleRepository = require('../repository/scheduleRepository');
const routesRepository = require('../repository/routesRepository');
const studentRepository = require('../repository/studentRepository');
const { v4: uuidv4 } = require('uuid');
const pushNotificationRepository = require('../repository/pushNotificationRepository');
class TaxiCompanyService {
    async assignDriverToBooking(id, bookingId, driverId) {
        const booking = await bookingRepository.getBookingById(bookingId);
        if(!booking){
            return this.createResponse(false, 'Booking not found', { bookingId });
        }

        const parent = await parentRepository.getParentByUserId(booking.userId);
        if(!parent){
            return this.createResponse(false, 'Parent not found', { booking });
        }
        const taxiCompany = await taxiCompanyRepository.findById(id);
        if(!taxiCompany){
            return this.createResponse(false, 'Taxi company not found', { id });
        }

        if(parent.zipcode && taxiCompany.zipCode.length > 0){
            if(!taxiCompany.zipCode.includes(parent.zipcode)){
                return this.createResponse(false, 'this booking is not in your area');
            }
        }


        
        const driver = await driverRepository.getDriverById(driverId);
        if(!driver){
            return this.createResponse(false, 'Driver not found', { driverId });
        }
        const book = await bookingRepository.assignDriverToBooking(bookingId, driverId);
        if (!book) {
            return this.createResponse(false, 'Failed to assign driver to booking', { bookingId, driverId });
        }
        
        return this.createResponse(true, 'Driver assigned to booking successfully', { booking });
        
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        // Radius of the Earth in kilometers
        const R = 6371;
        
        // Convert latitude and longitude from degrees to radians
        const lat1Rad = this.toRadians(parseFloat(lat1));
        const lon1Rad = this.toRadians(parseFloat(lon1));
        const lat2Rad = this.toRadians(parseFloat(lat2));
        const lon2Rad = this.toRadians(parseFloat(lon2));
        
        // Differences in coordinates
        const dLat = lat2Rad - lat1Rad;
        const dLon = lon2Rad - lon1Rad;
        
        // Haversine formula
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1Rad) * Math.cos(lat2Rad) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c; // Distance in kilometers
        
        return Number(distance.toFixed(1)); // Round to 1 decimal place
    }

    toRadians(degrees) {
        return degrees * (Math.PI/180);
    }

    createResponse(success, message, data = null) {
        return {
            success,
            message,
            data
        };
    }

    async createNewRide(rideData) {
        async function updateScheduleAndNotifyStudents(schedule, students) {
            // Update schedule students' ride status
            students.forEach(update => {
                const student = schedule.students.find(s => s.studentId === update.studentId);
                if (student) student.rideStatus = update.rideStatus;
            });

            const updatedSchedule = await scheduleRepository.updateScheduleStudentsRideStatus(
                schedule.id,
                schedule.students
            );
            if (!updatedSchedule) {
                console.error('Failed to update schedule students ride status');
            }

            // Send notifications for each student
            for (const student of students) {
                const studentData = await studentRepository.getStudentById(student.studentId);
                const pushNotification = await pushNotificationRepository.getPushNotificationByUserId(schedule.userId);
                
                if (!pushNotification) continue;

                const notifications = {
                    "PICKED_UP_HOME": ["Driver arrived", "Driver arrived at your home."],
                    "DROPPED_OFF_SCHOOL": ["Student dropped off", `${studentData.studentName ?? "your student"} has been dropped off at school.`],
                    "DROPPED_OFF_HOME": ["Student dropped off", `${studentData.studentName ?? "your student"} has been dropped off at home.`],
                    "PICKED_UP_SCHOOL": ["Student picked up", `${studentData.studentName ?? "your student"} has been picked up at school.`],
                    "PICKING_UP_HOME": ["Driver started", "Driver is on the way to home."]
                };

                const [title, message] = notifications[student.rideStatus] || [];
                if (title) {
                    await notificationService.sendNotification(
                        pushNotification[0].deviceToken,
                        title,
                        message
                    );
                }
            }
        }

        const route = await routesRepository.getRouteByScheduleId(rideData.scheduleId);
        if (!route) {
            const booking = await bookingRepository.getBookingbyscheduleId(rideData.scheduleId);
            if (!booking) return this.createResponse(false, 'Booking not found', { rideData });

            const driver = await driverRepository.getDriverById(booking[0].driverId);
            if (!driver) return this.createResponse(false, 'Driver not found', { rideData });

            // Set ride metadata
            const newDateString = new Date().toISOString();
            Object.assign(rideData, {
                id: uuidv4(),
                dateCreated: newDateString.slice(0, 10),
                createdAt: newDateString,
                driverUserId: driver.userId,
                rideDistance: -1
            });

            const schedule = await scheduleRepository.getScheduleById(rideData.scheduleId);
            if (schedule) {
                await updateScheduleAndNotifyStudents(schedule, rideData.students);
            }

            const createdRoute = await routesRepository.createRoute(rideData);
            if (!createdRoute) {
                return this.createResponse(false, 'Failed to create route', { rideData });
            }
            return this.createResponse(true, 'Ride created successfully', { rideData });
        } else {
            const updateRoute = await routesRepository.updateRoute(route.id, rideData);
            const schedule = await scheduleRepository.getScheduleById(rideData.scheduleId);
            
            if (schedule) {
                await updateScheduleAndNotifyStudents(schedule, rideData.students);
            }

            if (!updateRoute) {
                return this.createResponse(false, 'Failed to update route', { route });
            }
            return this.createResponse(true, 'Ride updated successfully', { updateRoute });
        }
    }

    async getBookings(taxiCode, page, pageSize) {
        const driver = await driverRepository.getDriverByTaxiCode(taxiCode);
        if(driver.length === 0){
            return this.createResponse(false, 'Driver not found', { taxiCode });
        }
        const driverIDs = driver.map(driver => driver.id);
        const bookings = await bookingRepository.getBookingsBydriverIDs(driverIDs, page, pageSize);
        return bookings;
    }
}

module.exports = new TaxiCompanyService();
