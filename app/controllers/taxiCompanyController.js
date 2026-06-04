const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const taxiCompanyRepo = require('../repository/taxiCompanyRepository');
const driverRepo = require('../repository/driverRepository');
const signinRepo = require('../repository/SigninRepository');
const bookingRepo = require('../repository/bookingsRepository');
const scheduleRepo = require('../repository/scheduleRepository');
const parentsRepo = require('../repository/parentsRepository');
const studentRepo = require('../repository/studentRepository');
const stripe = require("stripe")(process.env.stripeKey); 
const { ScanCommand,DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { dynamoClient } = require("../../config/aws");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);
const taxiCompanyService = require('../services/taxiCompanyService');
const notificationRepository = require('../repository/notificationRepository');
const notificationService = require('../services/notificationService');
const scheduleRepository = require('../repository/scheduleRepository');
const bookingRepository = require('../repository/bookingsRepository');
const { v4: uuidv4 } = require('uuid');
// Register new taxi company
const register = async (req, res) => {
    try {
        const { companyName, email, password, taxiCode } = req.body;
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        // Check if company already exists
        const existingCompany = await taxiCompanyRepo.findByEmail(email);
        if (existingCompany) {
            return res.status(400).json({ message: 'Company with this email already exists' });
        }

        // Check if taxi code exists and is valid
        const existingTaxiCode = await taxiCompanyRepo.findByTaxiCode(taxiCode);
        if (existingTaxiCode) {
            if (!existingTaxiCode.email) {
                // Update the existing taxi code record with new company information
                await taxiCompanyRepo.update(existingTaxiCode.id, {
                    companyName,  // Make sure this matches your field name in DynamoDB
                    email,
                    password: hashedPassword,
                    status: 'active'  // Optional: if you want to set a status
                });
                 // Generate JWT token
                const token = jwt.sign(
                    { id: existingTaxiCode.id, email: existingTaxiCode.email },
                    process.env.jwtSecretToken,
                    { expiresIn: '7d' }
                );

                res.status(201).json({
                    message: 'Company registered successfully',
                    token,
                    company: {
                        id: existingTaxiCode.id,
                        companyName: existingTaxiCode.taxiCompanyName,
                        email: existingTaxiCode.email,
                        taxiCode: existingTaxiCode.taxiCode
                    }
                });
            } else {
                return res.status(400).json({ message: 'This taxi code is already registered' });
            }
        }



        // Create new company
        const newCompany = await taxiCompanyRepo.create({
            taxiCompanyName: companyName,
            email,
            password: hashedPassword,
            taxiCode
        });

        // Generate JWT token
        const token = jwt.sign(
            { id: newCompany.companyId, email: newCompany.email },
            process.env.jwtSecretToken,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'Company registered successfully',
            token,
            company: {
                id: newCompany.id,
                companyName: newCompany.taxiCompanyName,
                email: newCompany.email,
                taxiCode: newCompany.taxiCode
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Login taxi company
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if company exists
        const company = await taxiCompanyRepo.findByEmail(email);
        if (!company) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, company.password);
        if (!isValidPassword) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: company.id, email: company.email, taxiCode: company.taxiCode },
            process.env.jwtSecretToken,
            { expiresIn: '7d' }
        );

        res.status(200).json({
            message: 'Login successful',
            token,
            company: {
                id: company.id,
                taxiCompanyName: company.taxiCompanyName,
                email: company.email,
                taxiCode: company.taxiCode
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const update = async (req, res) => {
    try {
        const { id } = req.user;
        const { 
            companyName,
            email, 
            password,
            taxiCompanyName,
            taxiCity,
            taxiState,
            taxiName,
            zipCode
        } = req.body;

        // Build updateData object with only provided fields
        const updateData = {};
        if (companyName) updateData.companyName = companyName;
        if (email) updateData.email = email;
        if (password) updateData.password = password;
        if (taxiCompanyName) updateData.taxiCompanyName = taxiCompanyName;
        if (taxiCity) updateData.taxiCity = taxiCity;
        if (taxiState) updateData.taxiState = taxiState;
        if (taxiName) updateData.taxiName = taxiName;
        if (zipCode) updateData.zipCode = zipCode;

        const updatedCompany = await taxiCompanyRepo.update(id, updateData);

        res.status(200).json({
            message: 'Company updated successfully',
            company: {
                taxiCode: updatedCompany.taxiCode,
                taxiCompanyName: updatedCompany.taxiCompanyName,
                taxiCity: updatedCompany.taxiCity,
                taxiState: updatedCompany.taxiState,
                taxiName: updatedCompany.taxiName,
                zipCode: updatedCompany.zipCode,
                email: updatedCompany.email
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const driver = async (req, res) => {
    try {
        const { taxiCode } = req.user;
        const { page = 1, pageSize = 10 } = req.query;
        
        if (!taxiCode) {
            return res.status(400).json({ message: 'Taxi code not found in token' });
        }

        const drivers = await driverRepo.findAllDriversByTaxiCode(
            taxiCode,
            parseInt(page),
            parseInt(pageSize)
        );

        res.status(200).json({
            message: 'Drivers fetched successfully',
            data: {
                drivers: drivers.items,
                pagination: {
                    total_items: drivers.totalItems,
                    total_pages: drivers.totalPages,
                    current_page: drivers.currentPage,
                    page_size: drivers.pageSize,
                    has_next: drivers.currentPage < drivers.totalPages,
                    has_previous: drivers.currentPage > 1
                }
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const createDriver = async (req, res) => {
    try {
        const { taxiCode } = req.user;
        const {
            email,
            phoneNumber,
            password,
            driverName,
            address,
            city,
            country,
            plateNumber,
            vehicleName,
            vehicleYear,
            experience,
            maxPassenger,
            description,
            driverLocation,
            card
        } = req.body;

        // Check if email exists in either signin or driver table
        const existingSigninUser = await signinRepo.findByEmail(email);
        const existingDriver = await driverRepo.findByEmail(email);
        
        if (existingSigninUser || existingDriver) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        // Hash password for signin table
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const stripeAccount = await stripe.accounts.create({
            email: email,
            type: 'express',
            country: 'US',
            business_type: 'individual',
            capabilities: {
                card_payments: {requested: true},
                transfers: {requested: true}
            },
            settings: {
                payouts: {
                    schedule: {
                        interval: 'manual'
                    }
                }
            }
        });

        // Add capability verification check
        const accountCapabilities = await stripe.accounts.retrieve(stripeAccount.id);
        if (accountCapabilities.capabilities.card_payments !== 'active' || 
            accountCapabilities.capabilities.transfers !== 'active') {
            console.log('Account capabilities pending verification. Current status:', accountCapabilities.capabilities);
        }

        // Create external account using a test debit card token
        const externalAccount = await stripe.accounts.createExternalAccount(
            stripeAccount.id,
            {
                external_account: 'btok_us_verified', // Test token for a US bank account
            }
        );

        // Create account link for onboarding
        const accountLink = await stripe.accountLinks.create({
            account: stripeAccount.id,
            refresh_url: `https://schoolryde.com/`, // URL if user stops onboarding
            return_url: `https://schoolryde.com/`,   // URL after completion
            type: 'account_onboarding',
            collect: 'eventually_due'  // This ensures all required fields are collected
        });

        // You should redirect the user to this URL
        console.log('Onboarding URL:', accountLink.url);

        // Create user in signin table
        const newUser = await signinRepo.createUser({
            email,
            phoneNumber,
            password: hashedPassword,
            role: 'DRIVER',
            type: 'DRIVER'
        });

        // Create driver in driver table
        const newDriver = await driverRepo.create({
            userId: newUser.id,
            driverName,
            email,
            phoneNumber,
            taxiCode,
            address,
            city,
            country,
            plateNumber,
            vehicleName,
            vehicleYear,
            experience,
            maxPassenger,
            description,
            driverLocation,
            stripeAccountId: stripeAccount.id,
            stripeAccount: stripeAccount
        });

        res.status(201).json({
            message: 'Driver created successfully',
            driver: {
                userId: newUser.id,
                driverId: newDriver.id,
                driverName: newDriver.driverName,
                email: newDriver.email,
                phoneNumber: newDriver.phoneNumber,
                taxiCode: newDriver.taxiCode,
                status: newDriver.status,
                approvedStatus: newDriver.approvedStatus
            },
            stripe:{
                stripeAccountId: stripeAccount.id,
                stripeAccount: stripeAccount,
                externalAccount: externalAccount.id
            },
            accountLink: accountLink.url
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const driverById = async (req, res) => {
    try {
        const { id } = req.params;
        const { taxiCode } = req.user;
        const driver = await driverRepo.getDriverById(id);
        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        if(driver.taxiCode != taxiCode){
            return res.status(404).json({ message: 'Driver not found' });
        }

        const signin = await signinRepo.findById(driver.userId);
        if(!signin) {
            return res.status(404).json({ message: 'Signin not found' });
        }
        res.status(200).json({
            message: 'Driver fetched successfully',
            driver,
            signin
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
}

const deleteDriver = async (req, res) => {
    try {
        const { id } = req.params;
        const { taxiCode } = req.user;
        const driver = await driverRepo.getDriverById(id);
        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }
        if(driver.taxiCode != taxiCode){
            return res.status(404).json({ message: 'Driver not found' });
        }

        // Store IDs for potential rollback
        const driverId = driver.id;
        const userId = driver.userId;

        try {
            // Attempt to delete driver first
            await driverRepo.deleteDriver(driverId);
            try {
                // Then attempt to delete user
                await signinRepo.deleteUser(userId);
            } catch (userDeleteError) {
                // If user deletion fails, restore driver
                await driverRepo.restoreDriver(driverId);
                throw userDeleteError;
            }
        } catch (error) {
            throw new Error('Delete operation failed: ' + error.message);
        }

        res.status(200).json({ message: 'Driver deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
}

const updateDriver = async (req, res) => {
    try {
        const { id } = req.params;
        const { taxiCode } = req.user;
        const { 
            driverName, 
            email, 
            phoneNumber, 
            address, 
            city, 
            country, 
            plateNumber, 
            vehicleName, 
            vehicleYear, 
            experience,
            maxPassenger, 
            description,
            driverLocation,
            age,
            gender,
            zipcode,
            role
        } = req.body;

        // Check if driver exists and belongs to company
        const driver = await driverRepo.getDriverById(id);
        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }
        if (driver.taxiCode !== taxiCode) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        // Build update object with all possible fields
        const updateData = {
            driverName,
            email,
            phoneNumber,
            address,
            city,
            country,
            plateNumber,
            vehicleName,
            vehicleYear,
            experience,
            maxPassenger,
            description,
            driverLocation,
            age,
            gender,
            zipcode,
            role
        };

        // Remove undefined fields
        Object.keys(updateData).forEach(key => 
            updateData[key] === undefined && delete updateData[key]
        );

        const updatedDriver = await driverRepo.updateDriver(id, updateData);
        res.status(200).json({ 
            message: 'Driver updated successfully',
            driver: updatedDriver
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
}   

const bookingById = async (req, res) => {
    try {
        const { id } = req.params;
        console.log("id",id)
        const { taxiCode } = req.user;
        const booking = await bookingRepo.getBookingById(id);
        if(!booking){
            return res.status(404).json({ message: 'Booking not found' });
        }

        if(booking.driverId){
            const driver = await driverRepo.getDriverById(booking.driverId);
            if(!driver){
                return res.status(404).json({ message: 'Driver not found' });
            }
            if(driver.taxiCode != taxiCode){
                return res.status(404).json({ message: 'Booking not found' });
            }
            res.status(200).json({
                message: 'Booking fetched successfully',
                booking,
                driver:{
                    driverId:driver.id,
                    driverName:driver.driverName,
                    email:driver.email,
                    phoneNumber:driver.phoneNumber,
                    taxiCode:driver.taxiCode,
                    plateNumber:driver.plateNumber,
                    vehicleName:driver.vehicleName,
                    vehicleYear:driver.vehicleYear,
                    maxPassenger:driver.maxPassenger,
                }
            });
        }else{
            res.status(200).json({
                message: 'Booking fetched successfully',
                booking
            });
        }   
            
        
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
}


const scheduleById = async (req, res) => {
    try {
        const { id } = req.params;
        const schedule = await scheduleRepo.getScheduleById(id);
        if(!schedule){
            return res.status(404).json({ message: 'Schedule not found' });
        }
        res.status(200).json({
            message: 'Schedule fetched successfully',
            schedule
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
}

const parentsById = async (req, res) => {
    try {
        const { id } = req.params;
        const signin = await signinRepo.findById(id);
        if(!signin){
            return res.status(404).json({ message: 'Signin not found' });
        }
        const parents = await parentsRepo.getParentByUserId(id);
        if(!parents){
            return res.status(404).json({ message: 'Parents not found' });
        }
        res.status(200).json({
            message: 'Parents fetched successfully',
            parents,
            signin
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
}

const confirmBooking = async (req, res) => {
    try {
        const { bookingId } = req.body;
        const { taxiCode } = req.user;
        const booking = await bookingRepo.getBookingById(bookingId);
        if(!booking){
            return res.status(404).json({ message: 'Booking not found' });
        }
        const driver = await driverRepo.getDriverById(booking.driverId);
        if(!driver){
            return res.status(404).json({ message: 'Driver not found' });
        }
        if(driver.taxiCode != taxiCode){
            return res.status(404).json({ message: 'Booking not found or not your driver' });
        }

        // if(booking.bookingStatus == 'ACCEPTED'){
        //     return res.status(200).json({ message: 'Booking is already confirmed' });
        // }

        const updateBooking = await bookingRepo.updateBooking(bookingId, "ACCEPTED"); 
        const parent = await parentsRepo.getParentByUserId(booking.userId);
        const addDrivertoParent = await parentsRepo.addDrivertoParent(parent.id, driver.id);
        if(!addDrivertoParent){
            return res.status(404).json({ message: 'Failed to add driver to parent' });
        }

        
        const schedule = await scheduleRepository.getScheduleById(booking.scheduleId);
        if(!schedule){
            return res.status(404).json({ message: 'Schedule not found' });
        }
        let eachPrice = 0;
        if(schedule.students.length > 0){
            // const allBookings = await bookingRepository.getAllBookingsByUserId(booking.driverId, "ACCEPTED", booking.id);
            // const totalStudents = allBookings.reduce((sum, booking) => sum + (booking.totalStudent || 0), 0);
            const totalStudents = schedule.students.length;
            let price = 0;
            if(totalStudents === 1){
              price = 39;
            } else if(totalStudents === 2){
              price = 30;
            } else if(totalStudents === 3){
              price = 25;
            } else {
              price = 20;
            } 
            for(const student of schedule.students){
                const distance = calculateDistance(student.pickUpLocation.latitude, student.pickUpLocation.longitude, student.dropOffLocation.latitude, student.dropOffLocation.longitude);
                if(distance <= 5){
                    student.cost = price;
                    eachPrice = price;
                } else if(distance > 5 && distance <= 10){
                    student.cost = price + 12;
                    eachPrice = price + 12;
                } else if(distance > 10 && distance <= 15){
                    student.cost = price + 24;
                    eachPrice = price + 24;
                } else if(distance > 15 && distance <= 20){
                    student.cost = price + 36;
                    eachPrice = price + 36;
                } else if(distance > 20 && distance <= 25){
                    student.cost = price + 48;
                    eachPrice = price + 48;
                } else if(distance > 25 && distance <= 30){
                    student.cost = price + 60;
                    eachPrice = price + 60;
                } else if(distance > 30 && distance <= 35){
                    student.cost = price + 72;
                    eachPrice = price + 72;
                } else if(distance > 35 && distance <= 40){
                    student.cost = price + 84;
                    eachPrice = price + 84;
                } else if(distance > 40 && distance <= 45){
                    student.cost = price + 96;
                    eachPrice = price + 96;
                } else if(distance > 45 && distance <= 50){
                    student.cost = price + 108;
                    eachPrice = price + 108;
                } else {
                    student.cost = -1;
                }
            }
            // Save updated schedule with costs back to DynamoDB
            const updatedSchedule = await scheduleRepository.updateSchedule(schedule.id, {
                students: schedule.students
            });
            if (!updatedSchedule) {
                return res.status(404).json({ message: 'Failed to update schedule with costs' });
            }
        }

        const deviceTokenParent = await notificationRepository.GetDeviceToken(parent.userId);
        if(deviceTokenParent.length > 0 && deviceTokenParent[0].deviceToken){
            await notificationService.sendNotification(
                deviceTokenParent[0].deviceToken,
                'Booking confirmed',
                `Your booking has been confirmed. ${driver.driverName} has been assigned as your driver. Price for each ride is $${eachPrice}. Once we have more kids join the ride, your cost will be reduced.`
            );
        }

        // Handle chat automation
        const chatDetails = await prepareChatDetails(booking);
        if (chatDetails) {
            await createAutomatedChat(chatDetails);
        }

        res.status(200).json({
            message: 'Booking confirmed successfully',
            booking: updateBooking
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
}

const prepareChatDetails = async (booking) => {
    const parent = await parentsRepo.getParentByUserId(booking.userId);
    const driver = await driverRepo.getDriverById(booking.driverId);

    if (!parent || !driver) return null;

    return {
        id: uuidv4(),
        roomID: [driver.userId, parent.userId].sort().join("_"),
        timestamp: Math.floor(new Date().getTime() / 1000),
        senderUserID: driver.userId,
        receiverUserID: parent.userId,
        message: "Automated Chat. Booking Confirmed",
        messageType: "text",
        status: "send",
        role: "driver",
        senderName: driver.driverName || driver.name,
        senderImageURL: driver.imageUrl,
        receiverName: parent.parentName || parent.name,
        receiverImageURL: parent.imageUrl || parent.imageURL,
    };
};

const createAutomatedChat = async (chatDetails) => {
    const params = {
        TableName: "chatTable",
        Item: chatDetails
    };
    return dynamoDocumentClient.send(new PutCommand(params));
};

const studentById = async (req, res) => {
    try {
        const { id } = req.params;
        const student = await studentRepo.getStudentById(id);
        if(!student){
            return res.status(404).json({ message: 'Student not found' });
        }
        res.status(200).json({
            message: 'Student fetched successfully',
            student
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
}

const driverLocation = async (req, res) => {
    try {
        const { driverId, location } = req.body;
        
        // Validate required fields
        if (!driverId) {
            return res.status(400).json({ success: false, message: 'Driver ID is required' });
        }
        
        if (!location || typeof location !== 'object') {
            return res.status(400).json({ success: false, message: 'Valid location object is required' });
        }
        
        // Verify driver exists
        const driver = await driverRepo.getDriverById(driverId);
        if (!driver) {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }
        
        // Verify driver belongs to this taxi company
        const { taxiCode } = req.user;
        if (driver.taxiCode !== taxiCode) {
            return res.status(403).json({ success: false, message: 'Unauthorized access to this driver' });
        }
        
        // Check whitelist data
        const whiteListParams = {
            TableName: "whiteListTable"
        };      
        const command = new ScanCommand(whiteListParams);
        const whitelistData = await dynamoDocumentClient.send(command);
        
        if (!whitelistData.Items || whitelistData.Items.length === 0) {
            return res.status(500).json({ success: false, message: 'Whitelist data not available' });
        }
        
        const whitelist = whitelistData.Items[0];
        let isAllowed = true;
        
        // Check country, state, and city against whitelist
        if (location.country && !whitelist.country.includes(location.country.toLowerCase())) {
            isAllowed = false;
        }
        
        if (location.state && !whitelist.stateLoc.includes(location.state.toLowerCase())) {
            isAllowed = false;
        }
        
        if (location.city && !whitelist.city.includes(location.city.toLowerCase())) {
            isAllowed = false;
        }
        
        if (!isAllowed) {
            return res.status(400).json({ 
                success: false, 
                message: "Location is not in the whitelist" 
            });
        }
        
        // Update driver location
        await driverRepo.updateDriverLocation(driverId, location);
        
        return res.status(200).json({ 
            success: true, 
            message: 'Driver location updated successfully' 
        });
    } catch (error) {
        console.error('Driver location update error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error', 
            error: error.message 
        });
    }
};

const assignDriverToBooking = async (req, res) => {
    try {
        const { id } = req.user;
        const { bookingId, driverId } = req.body;
        const result = await taxiCompanyService.assignDriverToBooking(id, bookingId, driverId);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    // Radius of the Earth in kilometers
    const R = 6371;
    
    // Convert latitude and longitude from degrees to radians
    const lat1Rad = toRadians(parseFloat(lat1));
    const lon1Rad = toRadians(parseFloat(lon1));
    const lat2Rad = toRadians(parseFloat(lat2));
    const lon2Rad = toRadians(parseFloat(lon2));
    
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

function toRadians(degrees) {
    return degrees * (Math.PI/180);
}

const updateRideStatus = async (req, res) => {
    try {
        const { id } = req.user;
        // Validate required fields
        if (!id) {
            return res.status(401).json({ message: 'Unauthorized access' });
        }
        const result = await taxiCompanyService.createNewRide(req.body);

        res.status(200).json({
            success: true,
            message: result.message,
            data: result.data
        });
    } catch (error) {
        console.error('Update ride status error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error', 
            error: error.message 
        });
    }
};

const booking = async (req, res) => {
    try {
        const { taxiCode } = req.user;
        const { page = 1, pageSize = 10 } = req.query;
        
        const bookings = await taxiCompanyService.getBookings(taxiCode, parseInt(page), parseInt(pageSize));
        res.status(200).json({
            message: 'Bookings fetched successfully',
            bookings
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
}


const newBookings = async (req, res) => {
    try {
        const { page = 1, pageSize = 10 } = req.query;
        
        const result = await bookingRepository.getAllnewBookings(
            parseInt(page),
            parseInt(pageSize)
        );
        
        res.status(200).json({
            message: 'New bookings fetched successfully',
            data: {
                bookings: result.items,
                pagination: {
                    total_items: result.totalItems,
                    total_pages: result.totalPages,
                    current_page: result.currentPage,
                    page_size: result.pageSize,
                    has_next: result.currentPage < result.totalPages,
                    has_previous: result.currentPage > 1
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            message: 'Error fetching new bookings',
            error: error.message
        });
    }
};

const studentParentById = async (req, res) => {
    try {
        const { id } = req.params;
        const parent = await studentRepo.getStudentParentById(id);
        res.status(200).json({
            message: 'Student parent fetched successfully',
            parent
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
}   


module.exports = {
    register,
    login,
    driver,
    update,
    createDriver,
    driverById,
    deleteDriver,
    updateDriver,
    bookingById,
    booking,
    scheduleById,
    parentsById,
    confirmBooking,
    studentById,
    driverLocation,
    assignDriverToBooking,
    updateRideStatus,
    newBookings,
    studentParentById
};
