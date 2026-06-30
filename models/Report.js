const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    reporterUuid: { type: String, required: true }, // Người kiện
    reportedUuid: { type: String, required: true }, // Kẻ bị kiện
    messageId: { type: String, required: true },
    messageContent: { type: String, required: true },
    reason: { type: String, default: 'Ngôn từ không phù hợp' },
    status: { type: String, default: 'pending' }, // pending (chờ xử lý) hoặc resolved (đã xử lý)
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Report', reportSchema);