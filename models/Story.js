const mongoose = require('mongoose');

// Định nghĩa cấu trúc cho 1 Chương truyện
const chapterSchema = new mongoose.Schema({
    title: { type: String, required: true }, // Ví dụ: "Chương 1: Lần Đầu Gặp Gỡ"
    content: { type: String },               // Chứa văn bản (cho truyện chữ)
    images: [{ type: String }]               // Chứa các link ảnh (cho truyện tranh)
});

// Định nghĩa cấu trúc cho 1 Bộ truyện
const storySchema = new mongoose.Schema({
    title: { type: String, required: true },
    format: { type: String, required: true }, // 'truyen-chu' hoặc 'truyen-tranh'
    status: { type: String, default: 'dang-ra' },
    tags: [{ type: String }],                 // Mảng chứa các thẻ như 'hoc-duong'
    author: { type: String, required: true },
    image: { type: String },                  // Link ảnh bìa
    desc: { type: String },                   // Mô tả ngắn
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    chaptersData: [chapterSchema]             // Nhúng các chương truyện vào đây
}, { timestamps: true }); // Tự động tạo thời gian đăng truyện (createdAt)

module.exports = mongoose.model('Story', storySchema);