const mongoose = require('mongoose');

const bannedUserSchema = new mongoose.Schema({
    ipAddress: { type: String, required: true, unique: true }, // Ghi nhớ số nhà mạng Wifi
    bannedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('BannedUser', bannedUserSchema);