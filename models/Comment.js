const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
    storyId: String,       // ID của bộ truyện
    chapterIndex: Number,  // Vị trí chương (-1 là chi tiết, >= 0 là trong chương)
    uuid: String,          // Mã định danh ẩn danh của người bình luận
    content: String        // Nội dung bình luận
}, { timestamps: true });

module.exports = mongoose.model('Comment', CommentSchema);