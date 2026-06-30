const mongoose = require('mongoose');

const bannedUserSchema = new mongoose.Schema({
    uuid: { type: String, required: true, unique: true }, // Mã thiết bị
    bannedAt: { type: Date, default: Date.now } // Thời gian bị cấm
});

module.exports = mongoose.model('BannedUser', bannedUserSchema);