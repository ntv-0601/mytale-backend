const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    uuid: { type: String, required: true },
    content: { type: String, required: true },
    replyToId: { type: String, default: null },
    replyToText: { type: String, default: null },
    isPinned: { type: Boolean, default: false },
    // BỔ SUNG NGĂN CHỨA CẢM XÚC: Lưu danh sách UUID của những người đã bấm
    reactions: {
        like: { type: [String], default: [] },
        heart: { type: [String], default: [] },
        haha: { type: [String], default: [] },
        cry: { type: [String], default: [] },
        sad: { type: [String], default: [] },
        angry: { type: [String], default: [] },
        wow: { type: [String], default: [] }
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);