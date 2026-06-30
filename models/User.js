const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true // Đảm bảo không có tài khoản trùng tên
    },
    password: { 
        type: String, 
        required: true 
    }
});

module.exports = mongoose.model('User', userSchema);