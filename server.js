const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose'); // Gọi mongoose để làm việc với Database
require('dotenv').config(); // Gọi dotenv để đọc link bảo mật trong file .env
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Story = require('./models/Story');

// Khởi tạo ứng dụng Express
const app = express();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 1. Tự động tạo thư mục 'uploads' nếu chưa có
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// 2. Cấu hình nơi lưu file và tên file
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Lưu vào thư mục uploads
    },
    filename: (req, file, cb) => {
        // Đặt tên file = thời gian hiện tại + đuôi file gốc (chống trùng tên)
        cb(null, Date.now() + path.extname(file.originalname)); 
    }
});
const upload = multer({ storage: storage });

// 3. Cho phép trình duyệt truy cập công khai vào thư mục uploads để xem ảnh
app.use('/uploads', express.static('uploads'));
// Cấu hình cơ bản
app.use(cors()); // Cho phép gọi API chéo tên miền
app.use(express.json()); // Giúp server đọc được dữ liệu dạng JSON

// --- PHẦN KẾT NỐI MONGODB (RẤT QUAN TRỌNG) ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('🟢 Đã kết nối thành công với MongoDB!'))
    .catch((err) => console.error('🔴 Lỗi kết nối Database:', err));

// Tạo một API kiểm tra (Endpoint)
app.get('/', (req, res) => {
    res.json({ message: "Chào mừng đến với hệ thống API của My Tale!" });
});

// API: Lấy toàn bộ danh sách truyện
app.get('/api/stories', async (req, res) => {
    try {
        // Lệnh tìm tất cả truyện trong Database
        const stories = await Story.find(); 
        // Trả kết quả về dạng JSON
        res.json(stories); 
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Lỗi khi lấy dữ liệu truyện!" });
    }
});

// API Tạm thời: Khởi tạo dữ liệu mẫu
app.get('/api/seed', async (req, res) => {
    try {
        const sampleStories = [
            {
                title: "Nghiệt Ngã Của Lời Hứa (Truyện Chữ)",
                format: "truyen-chu",
                status: "dang-ra",
                tags: ["hoc-duong", "tinh-cam"],
                author: "Vinh Ng",
                image: "Bia_truyen/bia_truyen.jpg",
                desc: "Câu chuyện bắt đầu vào một ngày hoa anh đào nở rộ...",
                chaptersData: [
                    {
                        title: "Chương 1: Lần Đầu Gặp Gỡ",
                        content: "<p>Bầu trời tháng Chín trong vắt...</p>"
                    }
                ]
            }
        ];

        // Xóa hết dữ liệu cũ để tránh trùng lặp khi test
        await Story.deleteMany({}); 
        // Nhét dữ liệu mẫu vào
        await Story.insertMany(sampleStories); 

        res.json({ message: "Đã thêm dữ liệu mẫu thành công!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Có lỗi xảy ra" });
    }
});
app.get('/api/setup-admin', async (req, res) => {
    try {
        // Kiểm tra xem đã có admin chưa
        const adminExists = await User.findOne({ username: 'admin' });
        if (adminExists) return res.status(400).json({ message: 'Tài khoản admin đã tồn tại!' });

        // Mã hóa mật khẩu (Ví dụ mật khẩu là: 123456)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('123456', salt);

        // Tạo tài khoản mới lưu vào Database
        const admin = new User({
            username: 'admin',
            password: hashedPassword
        });
        
        await admin.save();
        res.json({ message: 'Tạo tài khoản Admin thành công! Tài khoản: admin | Mật khẩu: 123456' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi khi tạo tài khoản' });
    }
});
// API: Đăng nhập
app.post('/api/login', async (req, res) => {
    try {
        // Lấy thông tin người dùng gửi lên
        const { username, password } = req.body;

        // 1. Kiểm tra tài khoản có tồn tại không
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ message: 'Sai tài khoản hoặc mật khẩu!' });

        // 2. So sánh mật khẩu
        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(400).json({ message: 'Sai tài khoản hoặc mật khẩu!' });

        // 3. Nếu đúng hết, tạo và cấp Token (có hạn 1 ngày)
        const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
        
        // Gửi token về cho Front-end cất giữ
        res.json({ message: 'Đăng nhập thành công!', token: token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server' });
    }
});
    // Middleware: Người kiểm duyệt Token
const verifyToken = (req, res, next) => {
    // Lấy token từ header của request
    const token = req.header('Authorization');
    
    // Nếu không có token -> Đuổi về
    if (!token) return res.status(401).json({ message: 'Từ chối truy cập! Yêu cầu đăng nhập.' });

    try {
        // Cắt bỏ chữ "Bearer " phía trước để lấy đúng mã token
        const cleanToken = token.replace('Bearer ', '');
        
        // Dùng chìa khóa bí mật để giải mã
        const verified = jwt.verify(cleanToken, process.env.JWT_SECRET);
        req.user = verified;
        
        // Cho phép đi tiếp vào API bên trong
        next(); 
    } catch (err) {
        res.status(400).json({ message: 'Token không hợp lệ hoặc đã hết hạn!' });
    }
};
app.post('/api/stories', verifyToken, async (req, res) => {
    try {
        // Tạo một cuốn truyện mới dựa trên dữ liệu gửi lên
        const newStory = new Story({
            title: req.body.title,
            format: req.body.format,
            author: req.body.author,
            desc: req.body.desc,
            tags: req.body.tags,
            image: req.body.image, // Tạm thời dùng link ảnh trực tiếp
            chaptersData: [] // Lúc mới tạo chưa có chương nào
        });

        // Lưu vào Database
        const savedStory = await newStory.save();
        res.json({ message: 'Đăng truyện thành công!', story: savedStory });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi khi lưu truyện mới' });
    }
});
// API: Thêm chương mới vào một bộ truyện (Bắt buộc có Token)
// API: Thêm chương mới vào một bộ truyện (Bắt buộc có Token)
// API: Nhận file ảnh từ máy tính (Tối đa 20 ảnh 1 lúc)
app.post('/api/upload', verifyToken, upload.array('images', 20), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'Không có file nào được tải lên!' });
        }

        // Tạo mảng chứa đường link của các file vừa lưu
        const fileUrls = req.files.map(file => `http://localhost:5000/uploads/${file.filename}`);
        
        // Trả danh sách link về cho giao diện
        res.json({ urls: fileUrls });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi khi tải ảnh lên máy chủ' });
    }
});
app.post('/api/stories/:id/chapters', verifyToken, async (req, res) => {
    try {
        const storyId = req.params.id;
        // Lấy thêm biến 'images' từ req.body
        const { title, content, images } = req.body; 

        const story = await Story.findById(storyId);
        if (!story) {
            return res.status(404).json({ message: 'Không tìm thấy bộ truyện này!' });
        }

        const newChapter = {
            title: title,
            content: content || "", // Nếu không có nội dung chữ thì để trống
            images: images || []    // Nếu có danh sách ảnh thì lưu vào, không thì để mảng rỗng
        };

        story.chaptersData.push(newChapter);
        await story.save();

        res.json({ message: 'Thêm chương mới thành công!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi khi lưu chương truyện' });
    }
});
// API: Xóa một bộ truyện (Bắt buộc có Token)
app.delete('/api/stories/:id', verifyToken, async (req, res) => {
    try {
        await Story.findByIdAndDelete(req.params.id);
        res.json({ message: 'Đã xóa truyện thành công!' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi xóa truyện' });
    }
});

// API: Xóa một chương truyện (Bắt buộc có Token)
app.delete('/api/stories/:storyId/chapters/:chapterId', verifyToken, async (req, res) => {
    try {
        const story = await Story.findById(req.params.storyId);
        if (!story) return res.status(404).json({ message: 'Không tìm thấy truyện!' });

        // Lọc bỏ cái chương có ID trùng với ID muốn xóa
        story.chaptersData = story.chaptersData.filter(chap => chap._id.toString() !== req.params.chapterId);
        await story.save();

        res.json({ message: 'Đã xóa chương thành công!' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi xóa chương' });
    }
});


// Định nghĩa cổng chạy server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy thành công tại http://localhost:${PORT}`);
});