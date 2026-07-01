const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose'); // Gọi mongoose để làm việc với Database
require('dotenv').config(); // Gọi dotenv để đọc link bảo mật trong file .env
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Story = require('./models/Story');
const Message = require('./models/Message');
const Report = require('./models/Report');
// Khởi tạo ứng dụng Express
const app = express();
const multer = require('multer');


// 1. Tự động tạo thư mục 'uploads' nếu chưa có
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
// Sổ theo dõi số lần vi phạm gửi link của từng người
const linkViolations = {};
// Lấy chìa khóa từ file bảo mật .env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cấu hình gói hàng gửi đi
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'my-tale-images', // Tên thư mục nó sẽ tự tạo trên Cloudinary
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'gif']
  },
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
// API: Cập nhật lượt thả tim (Không cần Token để độc giả nào cũng thả tim được)
app.put('/api/stories/:id/like', async (req, res) => {
    try {
        const story = await Story.findById(req.params.id);
        if (!story) return res.status(404).json({ message: 'Không tìm thấy truyện!' });

        // Cập nhật số tim mới từ Frontend gửi lên
        story.likes = req.body.likes;
        await story.save();

        res.json({ message: 'Đã lưu tim thành công!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi server khi thả tim' });
    }
});
app.get('/api/setup-admin', async (req, res) => {
    try {
        // Kiểm tra xem đã có admin chưa
        const adminExists = await User.findOne({ username: 'VinhNg' });
        if (adminExists) return res.status(400).json({ message: 'Tài khoản admin đã tồn tại!' });

        // Mã hóa mật khẩu (Ví dụ mật khẩu là: 123456)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('ToThuongCau', salt);

        // Tạo tài khoản mới lưu vào Database
        const admin = new User({
            username: 'VinhNg',
            password: hashedPassword
        });
        
        await admin.save();
        res.json({ message: 'Tạo tài khoản Admin thành công! Tài khoản: VinhNg | Mật khẩu: ToThuongCau' });
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

        // Với Cloudinary, đường link vĩnh viễn đã nằm sẵn trong thuộc tính 'path'
        const fileUrls = req.files.map(file => file.path);
        
        res.json({ urls: fileUrls });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi khi tải ảnh lên Cloudinary' });
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
// --- KHU VỰC CỘNG ĐỒNG ẨN DANH ---
app.post('/api/messages', async (req, res) => {
    try {
        const { uuid, content, replyToId, replyToText } = req.body;

        // 1. THUẬT TOÁN QUÉT LINK
        // Nhận diện HTTP, HTTPS, WWW, .com, .vn, .net...
        const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|vn|net|org|edu))/gi;
        
        if (linkRegex.test(content)) {
            // Ghi sổ vi phạm
            linkViolations[uuid] = (linkViolations[uuid] || 0) + 1;
            
            if (linkViolations[uuid] >= 2) {
                // Vi phạm lần 2 -> Khóa mõm vĩnh viễn!
                const newBan = new BannedUser({ ipAddress: uuid });
                await newBan.save();
                return res.status(403).json({ message: 'BẠN ĐÃ BỊ KHÓA VĨNH VIỄN DO RẢI LINK RÁC QUÁ NHIỀU LẦN!' });
            }
            
            // Vi phạm lần 1 -> Cảnh cáo
            return res.status(400).json({ message: `CẢNH BÁO LẦN ${linkViolations[uuid]}/2: Hệ thống nghiêm cấm gửi đường link vào nhóm!` });
        }

        // ... (Đoạn code kiểm tra từ bậy badWords cũ của bạn giữ nguyên ở dưới này) ...
// 1. Danh sách từ cấm (Bạn hãy bổ sung thêm các từ tục tĩu, nhạy cảm vào đây)
const badWords = [
    ' lồn', 'lồn ', ' cặc', 'cặc ', ' đụ', 'đụ ', 'địt', 
    'đĩ', 'phò', 'chó đẻ', 'đmm', 'đkm', 'vãi cả lồn', 
    'ngu học', 'óc chó', 'nứng', 'dâm', "dâm thủy", 'buồi', 'buoi', 'đéo', 'đéo ', 'đéo ', 'đéo',
    'đéo', 'đéo ', 'đéo ', 'đéo', 'đéo ', 'đéo ', 'đéo', 'đéo ', 'đéo ', 'đéo', 'đéo ', 'đéo ', 
    'đéo', 'đéo ', 'đéo ', 'đéo', 'đéo ', 'đéo ', 'đéo', 'đéo ', 'đéo ', 'đéo', 'đéo ', 
    'vãi lồn ', 'vãi  lồn', 'vãi lồn', 'vãilồn', "vãi cả lồn","súc sinh", "Súc sinh", 'địt','đụ','đéo','lồn','cặc','cu','buồi','bướm','chim','dái','đĩ','phò','đĩ điếm','điếm','đĩ thõa','đĩ chó',
    'dit','du','deo','lon','cac','cu','buoi','buom','chim','dai','di','pho','di diem',
    'dm','dmm','dcm','đm','đmm','đcm','cl','cc','vl','vcl','vkl','vcc',
    'đ!t','đ!t mẹ','đ*t','djt','d!t','d*t','d1t','d!o','đ3o','d3o','đ3o mẹ','l0n','l*n','l**n','1on','lonn','c4c','c@c','c*c','c4k','cak','kak','caccc','bu0i','b*oi','bưởi','c.u','l.o.n','c.a.c','đ ị t','đ ụ','l ồ n',
    'địt mẹ','địt má','địt bà','địt cụ','địt con mẹ','đụ mẹ','đụ má','đụ bà','đéo mẹ','đéo má','đéo biết','đéo chịu','cặc mẹ','cặc tao','lồn mẹ' , 'lồn má'
    // Bạn có thể thêm nhiều từ tục tĩu khác vào đây
    
];

const BannedUser = require('./models/BannedUser');

// API: Lấy danh sách tin nhắn (Tối đa 100 tin gần nhất để web không bị nặng)
app.get('/api/messages', async (req, res) => {
    try {
        const messages = await Message.find().sort({ createdAt: 1 }).limit(100);
        res.json(messages);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lấy tin nhắn' });
    }
});
// API: Ghim tin nhắn (Chỉ Admin mới có quyền)
app.put('/api/messages/:id/pin', verifyToken, async (req, res) => {
    try {
        // Hủy ghim tất cả các tin nhắn cũ trước (Mỗi lần chỉ ghim 1 tin)
        await Message.updateMany({}, { isPinned: false });
        
        // Ghim tin nhắn mới
        const message = await Message.findById(req.params.id);
        if (!message) return res.status(404).json({ message: 'Không tìm thấy tin nhắn!' });
        
        message.isPinned = true;
        await message.save();
        
        res.json({ message: 'Đã ghim tin nhắn!' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi ghim tin nhắn' });
    }
});

// API: Bỏ ghim tin nhắn
app.put('/api/messages/:id/unpin', verifyToken, async (req, res) => {
    try {
        const message = await Message.findById(req.params.id);
        if (message) {
            message.isPinned = false;
            await message.save();
        }
        res.json({ message: 'Đã bỏ ghim!' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi bỏ ghim' });
    }
});
// API: Thả cảm xúc cho tin nhắn
app.put('/api/messages/:id/react', async (req, res) => {
    try {
        const { uuid, type } = req.body;
        const validTypes = ['like', 'heart', 'haha', 'cry', 'sad', 'angry', 'wow'];
        
        if (!validTypes.includes(type)) return res.status(400).json({ message: 'Cảm xúc không hợp lệ!' });

        const message = await Message.findById(req.params.id);
        if (!message) return res.status(404).json({ message: 'Không tìm thấy tin nhắn!' });

        // Kiểm tra xem người này đã thả cảm xúc TYPE này chưa
        const hasReactedThisType = message.reactions[type].includes(uuid);

        // Xóa người dùng khỏi TẤT CẢ các mảng cảm xúc (Đảm bảo mỗi người chỉ 1 cảm xúc/tin)
        validTypes.forEach(t => {
            message.reactions[t] = message.reactions[t].filter(u => u !== uuid);
        });

        // Nếu họ chưa thả (hoặc đang đổi sang cảm xúc khác), thì thêm vào
        if (!hasReactedThisType) {
            message.reactions[type].push(uuid);
        }

        await message.save();
        res.json(message);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi thả cảm xúc' });
    }
});
// API: Gửi tin nhắn có kèm trạm kiểm duyệt
// API: Gửi tin nhắn có kèm trạm kiểm duyệt (Bản nâng cấp Database)
// API: Gửi tin nhắn có kèm trạm kiểm duyệt (Chặn theo IP)
// API: Xóa tin nhắn (Dành cho Chủ nhân hoặc Admin)
app.delete('/api/messages/:id', async (req, res) => {
    try {
        const { uuid } = req.body;
        const adminToken = req.headers['authorization']; // Lấy mã thẻ Admin nếu có
        
        const message = await Message.findById(req.params.id);
        if (!message) return res.status(404).json({ message: 'Không tìm thấy tin nhắn!' });

        // Kiểm tra quyền: Là Admin (có token hợp lệ) HOẶC là chủ nhân tin nhắn
        let isAdmin = false;
        if (adminToken && adminToken.startsWith('Bearer ')) {
            // Nếu bạn đang dùng jwt.verify ở trên, có thể dùng lại. 
            // Ở đây tạm thời cấp quyền nếu có gửi kèm thẻ Admin
            isAdmin = true; 
        }

        if (message.uuid !== uuid && !isAdmin) {
            return res.status(403).json({ message: 'Bạn không có quyền xóa tin nhắn này!' });
        }

        await Message.findByIdAndDelete(req.params.id);
        res.json({ message: 'Đã xóa tin nhắn thành công!' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi xóa tin nhắn' });
    }
});
app.post('/api/messages', async (req, res) => {
    try {
        const { uuid, content, replyToId, replyToText } = req.body;

        // Thuật toán bóc tách IP thật của người gửi (Kể cả khi dùng Render)
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        // 1. Kiểm tra Sổ đen xem IP này có tiền án không
        const isBanned = await BannedUser.findOne({ ipAddress: clientIp });
        if (isBanned) {
            return res.status(403).json({ message: 'Đường truyền mạng của bạn đã bị chặn vĩnh viễn do vi phạm tiêu chuẩn cộng đồng!' });
        }

        // 2. Quét từ ngữ vi phạm
        const lowerContent = content.toLowerCase();
        const containsBadWord = badWords.some(word => lowerContent.includes(word.toLowerCase()));

        if (containsBadWord) {
            // Tống cổ địa chỉ IP này vào Sổ đen
            const newBan = new BannedUser({ ipAddress: clientIp });
            await newBan.save();
            
            return res.status(403).json({ message: 'Phát hiện ngôn từ vi phạm! Đường truyền của bạn đã bị cấm.' });
        }

        // 3. Nếu an toàn, cho phép lưu vào Database
        const newMessage = new Message({ uuid, content, replyToId, replyToText });
        await newMessage.save();

        res.json(newMessage);
    } catch (error) {
        console.error("Lỗi server:", error);
        res.status(500).json({ message: 'Lỗi khi gửi tin nhắn' });
    }
});
// --- KHU VỰC ADMIN & TỐ CÁO ---

// 1. Người dùng gửi Đơn tố cáo
app.post('/api/reports', async (req, res) => {
    try {
        const newReport = new Report(req.body);
        await newReport.save();
        res.json({ message: 'Đã gửi tố cáo thành công! Cảm ơn bạn đã giúp cộng đồng trong sạch hơn.' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi gửi tố cáo' });
    }
});

// 2. Admin lấy danh sách Tố cáo
app.get('/api/reports', verifyToken, async (req, res) => {
    try {
        const reports = await Report.find({ status: 'pending' }).sort({ createdAt: -1 });
        res.json(reports);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lấy danh sách tố cáo' });
    }
});

// 3. Admin xử lý Đơn (Ban hoặc Bỏ qua)
app.post('/api/reports/:id/resolve', verifyToken, async (req, res) => {
    try {
        const { action, reportedUuid } = req.body; 
        const report = await Report.findById(req.params.id);
        
        if (action === 'ban' && reportedUuid) {
            // Tống mã UUID vào danh sách đen (sử dụng trường ipAddress tạm thời cho cả IP và UUID)
            const newBan = new BannedUser({ ipAddress: reportedUuid });
            await newBan.save();
        }
        
        report.status = 'resolved';
        await report.save();
        res.json({ message: 'Đã xử lý đơn tố cáo!' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi xử lý' });
    }
});

// 4. Admin Gỡ Ban (Unban) thủ công
app.post('/api/unban', verifyToken, async (req, res) => {
    try {
        const { target } = req.body; // Có thể là IP hoặc UUID
        await BannedUser.findOneAndDelete({ ipAddress: target });
        res.json({ message: `Đã ân xá thành công cho: ${target}` });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi ân xá' });
    }
});
// Định nghĩa cổng chạy server
const PORT = process.env.PORT || 5000;

// Ép buộc hệ thống mở cửa ở địa chỉ 0.0.0.0 để Render có thể nhìn thấy
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server đang chạy ngon lành trên cổng ${PORT}`);
    console.log(`📡 Địa chỉ IP mạng đang lắng nghe: 0.0.0.0`);
});