const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    uuid: { type: String, required: true },
    content: { type: String, required: true },
    replyToId: { type: String, default: null },
    replyToText: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);