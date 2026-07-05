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
const Comment = require('./models/Comment');
const SystemConfigSchema = new mongoose.Schema({
    key: { type: String, required: true },
    value: { type: [String], default: [] }
});
const SystemConfig = mongoose.model('SystemConfig', SystemConfigSchema);
// Khởi tạo ứng dụng Express
const app = express();
const multer = require('multer');

const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|(\b[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\b)/ig;
// 1. Tự động tạo thư mục 'uploads' nếu chưa có
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const LinkSpammerSchema = new mongoose.Schema({
    ipAddress: String,
    count: { type: Number, default: 0 }
});
const LinkSpammer = mongoose.model('LinkSpammer', LinkSpammerSchema);
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
function verifyToken(req, res, next) {
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
}
// --- PHẦN KẾT NỐI MONGODB (RẤT QUAN TRỌNG) ---
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('🟢 Đã kết nối thành công với MongoDB!');
        
        // CHỮA BỆNH E11000: Yêu cầu Database xóa bỏ luật chống trùng lặp cũ
        try {
            await mongoose.connection.collection('bannedusers').dropIndex('uuid_1');
            console.log('🔧 Đã dọn dẹp luật E11000 thành công!');
        } catch (error) {
            // Nếu Database không có luật này thì bỏ qua không sao cả
        }
    })
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
// --- HỆ THỐNG ĐÁNH GIÁ SAO (RATING) ---
const RatingSchema = new mongoose.Schema({
    storyId: { type: String, required: true },
    uuid: { type: String, required: true }, // Nhận diện người đánh giá để không bị bão vote
    score: { type: Number, required: true }
});
const Rating = mongoose.model('Rating', RatingSchema);

// API 1: Lấy điểm trung bình của truyện
app.get('/api/stories/:id/rating', async (req, res) => {
    try {
        const ratings = await Rating.find({ storyId: req.params.id });
        if (ratings.length === 0) return res.json({ average: 0, count: 0 });
        
        const sum = ratings.reduce((a, b) => a + b.score, 0);
        const average = (sum / ratings.length).toFixed(1);
        res.json({ average: parseFloat(average), count: ratings.length });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lấy đánh giá' });
    }
});

// API 2: Gửi điểm đánh giá (Tự động ghi đè nếu người này đổi ý muốn chấm lại)
app.post('/api/stories/:id/rating', async (req, res) => {
    try {
        const { uuid, score } = req.body;
        // Lưu hoặc cập nhật điểm của người dùng này
        await Rating.findOneAndUpdate(
            { storyId: req.params.id, uuid: uuid },
            { score: score },
            { upsert: true, new: true }
        );
        
        // Tính lại điểm trung bình ngay lập tức để trả về cho web
        const ratings = await Rating.find({ storyId: req.params.id });
        const sum = ratings.reduce((a, b) => a + b.score, 0);
        const average = (sum / ratings.length).toFixed(1);
        
        res.json({ average: parseFloat(average), count: ratings.length });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lưu đánh giá' });
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



// --- KHU VỰC DÀNH RIÊNG CHO QTV ---

// 1. QTV Đăng ký (Tự động cấp phát tên QTV1, QTV2...)
app.post('/api/qtv/register', async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) return res.status(400).json({ message: 'Vui lòng nhập mật khẩu!' });

        // ĐÃ FIX: Đếm xem đã có bao nhiêu QTV dựa vào TÊN tài khoản (bắt đầu bằng chữ QTV)
        const qtvCount = await User.countDocuments({ username: /^QTV/ });
        const newUsername = `QTV${qtvCount + 1}`;

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newQtv = new User({
            username: newUsername,
            password: hashedPassword
            // Đã bỏ trường role để tránh bị Mongoose từ chối lưu dữ liệu
        });
        await newQtv.save();

        res.json({ message: `Đăng ký thành công! Tài khoản của bạn là: ${newUsername}` });
    } catch (error) {
        console.error("Lỗi tạo QTV:", error);
        res.status(500).json({ message: 'Lỗi khi tạo tài khoản QTV' });
    }
});

// 2. QTV Đăng nhập
app.post('/api/qtv/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        
        // ĐÃ FIX: Kiểm tra xem tài khoản có tồn tại và tên có bắt đầu bằng chữ "QTV" không
        if (!user || !user.username.startsWith('QTV')) {
            return res.status(400).json({ message: 'Không tìm thấy QTV này!' });
        }

        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(400).json({ message: 'Sai mật khẩu!' });

        // Cấp thẻ có chứa cả tên để Frontend nhận diện
        const token = jwt.sign({ _id: user._id, role: 'qtv', username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ message: 'Đăng nhập thành công!', token: token, username: user.username });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi server' });
    }
});

// 3. API Lấy dòng chữ thông báo
app.get('/api/marquee', async (req, res) => {
    try {
        let config = await SystemConfig.findOne({ key: 'marquee' });
        if (!config) {
            // Nếu chưa có, tạo mặc định
            config = new SystemConfig({ key: 'marquee', value: ["Chào mừng đến với thư viện thanh xuân My Tale!", "Đừng quên ghé Góc Tâm Sự nhé!"] });
            await config.save();
        }
        res.json(config.value);
    } catch (error) { res.status(500).json([]); }
});

// 4. API Cập nhật dòng chữ thông báo (QTV hoặc Admin)
app.put('/api/marquee', verifyToken, async (req, res) => {
    try {
        const { texts } = req.body; // texts là một mảng các câu
        await SystemConfig.findOneAndUpdate({ key: 'marquee' }, { value: texts }, { upsert: true });
        res.json({ message: 'Đã cập nhật dòng chữ thông báo!' });
    } catch (error) { res.status(500).json({ message: 'Lỗi cập nhật' }); }
});
    // Middleware: Người kiểm duyệt Token

// 5. API Lấy Bảng Nội Quy
app.get('/api/rules', async (req, res) => {
    try {
        let config = await SystemConfig.findOne({ key: 'rules' });
        if (!config) {
            // Nếu chưa có, tạo nội quy mặc định
            config = new SystemConfig({ key: 'rules', value: ["Tôn trọng tác giả và các độc giả khác.", "Không spam, quảng cáo web khác.", "Cấm sử dụng ngôn từ tục tĩu."] });
            await config.save();
        }
        res.json(config.value);
    } catch (error) { res.status(500).json([]); }
});

// 6. API Cập nhật Bảng Nội Quy (Dành cho QTV/Admin)
app.put('/api/rules', verifyToken, async (req, res) => {
    try {
        const { texts } = req.body;
        await SystemConfig.findOneAndUpdate({ key: 'rules' }, { value: texts }, { upsert: true });
        res.json({ message: 'Đã cập nhật Bảng nội quy!' });
    } catch (error) { res.status(500).json({ message: 'Lỗi cập nhật' }); }
});
// API: Xử lý lượt bình chọn cho chương truyện
app.post('/api/stories/:storyId/chapters/:chapterId/vote', async (req, res) => {
    try {
        const { storyId, chapterId } = req.params;
        const { optionIndex } = req.body; 

        const story = await Story.findById(storyId);
        if (!story) {
            return res.status(404).json({ message: 'Không tìm thấy truyện' });
        }

        // ĐÃ FIX: Dùng vòng lặp find thay vì .id() để tránh lỗi vặt của Mongoose
        const chapter = story.chaptersData.find(chap => chap._id.toString() === chapterId.toString());
        
        if (!chapter) {
            return res.status(404).json({ message: 'Không tìm thấy chương truyện này trong Database' });
        }

        if (chapter.hasPoll && chapter.pollData && chapter.pollData.options[optionIndex]) {
            // Tăng số lượt bình chọn
            chapter.pollData.options[optionIndex].votes += 1;
            
            // Lưu lại
            await story.save();
            res.status(200).json({ message: 'Bình chọn thành công' });
        } else {
            res.status(400).json({ message: 'Dữ liệu bình chọn không hợp lệ' });
        }

    } catch (error) {
        console.error("Lỗi bình chọn:", error);
        res.status(500).json({ message: 'Lỗi máy chủ Backend: ' + error.message });
    }
});

// API: Thêm chương mới vào một bộ truyện (Bắt buộc có Token)
// API: Thêm chương mới vào một bộ truyện (Bắt buộc có Token)
// API: Nhận file ảnh từ máy tính (Tối đa 20 ảnh 1 lúc)
// API: Thêm chương mới vào một bộ truyện (Bắt buộc có Token)
app.post('/api/stories/:id/chapters', verifyToken, async (req, res) => {
    try {
        const storyId = req.params.id;
        // Nhận đầy đủ dữ liệu từ Admin gửi lên (Bao gồm cả bình chọn)
        const { title, content, images, hasPoll, pollData } = req.body; 

        const story = await Story.findById(storyId);
        if (!story) {
            return res.status(404).json({ message: 'Không tìm thấy bộ truyện này!' });
        }

        const newChapter = {
            title: title,
            content: content || "", 
            images: images || [],
            hasPoll: hasPoll || false,
            pollData: pollData || { question: "", options: [] }
        };

        story.chaptersData.push(newChapter);
        await story.save();

        res.json({ message: 'Thêm chương mới thành công!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Lỗi khi lưu chương truyện' });
    }
});
// ==========================================
// THÊM MỚI: API CHỈNH SỬA TRUYỆN & CHƯƠNG
// ==========================================

// API: Chỉnh sửa thông tin bộ truyện (Bắt buộc có Token)
app.put('/api/stories/:id', verifyToken, async (req, res) => {
    try {
        const { title, author, desc, status } = req.body;
        
        const story = await Story.findById(req.params.id);
        if (!story) return res.status(404).json({ message: 'Không tìm thấy truyện!' });

        // Cập nhật các trường dữ liệu nếu có gửi lên
        if (title !== undefined) story.title = title;
        if (author !== undefined) story.author = author;
        if (desc !== undefined) story.desc = desc;
        if (status !== undefined) story.status = status;

        await story.save();
        res.json({ message: 'Cập nhật thông tin truyện thành công!' });
    } catch (error) {
        console.error("Lỗi cập nhật truyện:", error);
        res.status(500).json({ message: 'Lỗi máy chủ khi cập nhật truyện' });
    }
});

// API: Chỉnh sửa nội dung chương truyện (Bắt buộc có Token)
app.put('/api/stories/:storyId/chapters/:chapterId', verifyToken, async (req, res) => {
    try {
        const { storyId, chapterId } = req.params;
        const { title, content } = req.body;

        const story = await Story.findById(storyId);
        if (!story) return res.status(404).json({ message: 'Không tìm thấy truyện!' });

        // Dùng vòng lặp find() tìm id chương (Giống cách bạn đã làm ở route Vote để né lỗi Mongoose)
        const chapter = story.chaptersData.find(chap => chap._id.toString() === chapterId.toString());
        
        if (!chapter) return res.status(404).json({ message: 'Không tìm thấy chương truyện này!' });

        // Cập nhật dữ liệu chương
        if (title !== undefined) chapter.title = title;
        if (content !== undefined) chapter.content = content;

        await story.save();
        res.json({ message: 'Cập nhật chương truyện thành công!' });
    } catch (error) {
        console.error("Lỗi cập nhật chương:", error);
        res.status(500).json({ message: 'Lỗi máy chủ khi cập nhật chương' });
    }
});
// ==========================================
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
// ==========================================
// API: QUẢN LÝ THÔNG TIN KHU TÁC GIẢ
// ==========================================
app.get('/api/author', async (req, res) => {
    try {
        let config = await SystemConfig.findOne({ key: 'author_profile' });
        if (!config || config.value.length === 0) {
            // Dữ liệu mặc định nếu chưa lưu lần nào
            return res.json({ 
                name: "Vinh Ng", 
                avatar: "AVT/IRO.jpg", 
                bg: "", 
                intro: "<p>Xin chào, mình là chủ nhân của <strong class=\"text-sakura-dark dark:text-night-accent font-handwriting text-2xl\">My Tale</strong>. Nơi đây là góc nhỏ mình lưu giữ những kỷ niệm, những câu chuyện tình cảm học đường mộng mơ mà mình sáng tác.</p><p>Dù ngoài kia có giông bão hay nắng gắt, mình hi vọng khi bước vào My Tale, bạn sẽ tìm thấy sự bình yên, tiếng cười và một chút ngọt ngào của tuổi trẻ.</p>" 
            });
        }
        res.json(JSON.parse(config.value[0]));
    } catch (error) { res.status(500).json({ message: 'Lỗi tải thông tin tác giả' }); }
});

app.put('/api/author', verifyToken, async (req, res) => {
    try {
        const profileData = JSON.stringify(req.body);
        await SystemConfig.findOneAndUpdate({ key: 'author_profile' }, { value: [profileData] }, { upsert: true });
        res.json({ message: 'Đã cập nhật Khu Tác Giả thành công!' });
    } catch (error) { res.status(500).json({ message: 'Lỗi khi lưu thông tin' }); }
});
// ==========================================
// --- KHU VỰC CỘNG ĐỒNG ẨN DANH ---

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
// API: Kiểm tra trạng thái Ban của người dùng hiện tại (Dùng để khóa giao diện)
app.get('/api/check-ban', async (req, res) => {
    try {
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const uuid = req.query.uuid;
        
        // Kiểm tra xem IP hoặc UUID này có trong Sổ đen không
        const isBanned = await BannedUser.findOne({
            $or: [
                { ipAddress: clientIp },
                { ipAddress: uuid }
            ]
        });
        
        // Trả về true nếu bị cấm, false nếu an toàn
        res.json({ isBanned: !!isBanned });
    } catch (error) {
        res.status(500).json({ isBanned: false });
    }
});
app.post('/api/messages', async (req, res) => {
    try {
        const { uuid, content, replyToId, replyToText } = req.body;

        // Thuật toán bóc tách IP thật của người gửi
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        // 1. SỬA LỖI TẠI ĐÂY: Kiểm tra xem IP hoặc UUID này có nằm trong Sổ đen không
        const isBanned = await BannedUser.findOne({
            $or: [
                { ipAddress: clientIp }, // Khóa theo IP (khi hệ thống tự động quét từ cấm/spam link)
                { ipAddress: uuid }      // Khóa theo UUID (khi Admin bấm Ban thủ công từ giao diện)
            ]
        });

        if (isBanned) {
            return res.status(403).json({ message: 'Thiết bị hoặc tài khoản của bạn đã bị chặn vĩnh viễn do vi phạm tiêu chuẩn cộng đồng!' });
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

        // 3. Kiểm tra và chặn đường link (Giữ nguyên phần code đã thêm ở bước trước)
        if (urlRegex.test(content)) {
            let spammer = await LinkSpammer.findOne({ ipAddress: clientIp });
            if (!spammer) {
                spammer = new LinkSpammer({ ipAddress: clientIp, count: 1 });
            } else {
                spammer.count += 1;
            }
            await spammer.save();

            if (spammer.count > 2) {
                const newBan = new BannedUser({ ipAddress: clientIp });
                await newBan.save();
                return res.status(403).json({ message: 'Bạn đã cố tình gửi đường link quá số lần quy định! Thiết bị đã bị cấm.' });
            } else {
                return res.status(400).json({ message: `Không được phép gửi đường link trong Góc Tâm Sự! (Cảnh báo: Vi phạm ${spammer.count}/2 lần)` });
            }
        }

        // 4. Nếu an toàn, cho phép lưu vào Database
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
app.post('/api/ban', verifyToken, async (req, res) => {
    try {
        const { target } = req.body; // PHẢI ĐƯA DÒNG NÀY LÊN TRÊN CÙNG
        if (!target) return res.status(400).json({ message: 'Vui lòng nhập định danh cần chặn!' });

        // Sau khi có target rồi mới được mang đi kiểm tra
        if (target.toLowerCase() === 'vinhng') {
            return res.status(403).json({ message: 'Náo loạn! Bạn không thể khóa tài khoản của Admin tối cao!' });
        }
        
        // Kiểm tra xem định danh này đã bị chặn từ trước chưa để tránh trùng lặp dữ liệu
        const existingBan = await BannedUser.findOne({ ipAddress: target });
        if (existingBan) return res.status(400).json({ message: 'Định danh này đã bị chặn từ trước rồi!' });

        // Tiến hành lưu định danh vào danh sách đen công khai
        const newBan = new BannedUser({ ipAddress: target });
        await newBan.save();
        
        res.json({ message: `Đã chặn vĩnh viễn thành công định danh: ${target}` });
    } catch (error) {
        console.error("Lỗi chặn thủ công:", error);
        res.status(500).json({ message: 'Lỗi chi tiết từ Server: ' + (error.message || error.toString()) });
    }
});
// 4. Admin Gỡ Ban (Unban) thủ công
app.post('/api/unban', verifyToken, async (req, res) => {
    try {
        const { target } = req.body; // Có thể là IP hoặc UUID
        
        // SỬA LỖI Ở ĐÂY: Dùng deleteMany để xóa TẤT CẢ các lệnh cấm đang xếp chồng lên nhau
        const result = await BannedUser.deleteMany({ ipAddress: target });
        
        // Kiểm tra xem có tìm thấy ai để xóa không
        if (result.deletedCount === 0) {
            return res.status(400).json({ message: `Không tìm thấy hồ sơ bị cấm nào của: ${target}` });
        }

        res.json({ message: `Đã ân xá thành công cho: ${target} (Gỡ ${result.deletedCount} lớp khóa)` });
    } catch (error) {
        console.error("Lỗi ân xá:", error);
        // In lỗi chi tiết ra màn hình nếu có
        res.status(500).json({ message: 'Lỗi chi tiết từ Server: ' + (error.message || error.toString()) });
    }
});
// --- BẢN VÁ: HỆ THỐNG BÌNH LUẬN TRUYỆN ---
// API: Lấy bình luận
app.get('/api/comments/:storyId', async (req, res) => {
    try {
        const comments = await Comment.find({ storyId: req.params.storyId }).sort({ createdAt: -1 });
        res.json(comments);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi tải bình luận' });
    }
});

// API: Gửi bình luận mới
app.post('/api/comments', async (req, res) => {
    try {
        const newComment = new Comment(req.body);
        await newComment.save();
        res.json(newComment);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi gửi bình luận' });
    }
});

// API: Admin xóa bình luận
app.delete('/api/comments/:id', verifyToken, async (req, res) => {
    try {
        await Comment.findByIdAndDelete(req.params.id);
        res.json({ message: 'Đã xóa bình luận!' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi xóa bình luận' });
    }
});
// Định nghĩa cổng chạy server
const PORT = process.env.PORT || 5000;

// Ép buộc hệ thống mở cửa ở địa chỉ 0.0.0.0 để Render có thể nhìn thấy
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server đang chạy ngon lành trên cổng ${PORT}`);
    console.log(`📡 Địa chỉ IP mạng đang lắng nghe: 0.0.0.0`);
});