require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const db = require('./db_handler');

const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '..')));

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

// --- Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ message: 'Access token required' });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid or expired token' });
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};

// --- Auth Routes ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        await db.users.create({ username, password });
        
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await db.users.findByUsername(username);
        if (!user) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }
        
        let isMatch = password === user.password;
        
        // Fallback for existing legacy bcrypt hashes
        if (!isMatch && user.password && user.password.startsWith('$2b$')) {
            try {
                const legacyBcrypt = require('bcryptjs');
                isMatch = await legacyBcrypt.compare(password, user.password);
                
                // Automatically migrate to plain text on successful login
                if (isMatch) {
                    await db.users.update(user.id, { password: password });
                    console.log(`Automatically updated legacy password to plain text for user: ${username}`);
                }
            } catch (bcryptErr) {
                console.error("Bcrypt fallback comparison failed:", bcryptErr);
            }
        }
        
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }
        
        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        
        // Log connection
        await db.logs.create({ userId: user.id, ipAddress: req.ip });
        
        res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        const user = await db.users.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
        }
        
        let isMatch = currentPassword === user.password;
        
        // Fallback for existing legacy bcrypt hashes
        if (!isMatch && user.password && user.password.startsWith('$2b$')) {
            try {
                const legacyBcrypt = require('bcryptjs');
                isMatch = await legacyBcrypt.compare(currentPassword, user.password);
            } catch (bcryptErr) {
                console.error("Bcrypt fallback comparison in change-password failed:", bcryptErr);
            }
        }
        
        if (!isMatch) {
            return res.status(400).json({ message: '현재 비밀번호가 일치하지 않습니다.' });
        }
        
        await db.users.update(user.id, { 
            password: newPassword 
        });
        
        res.json({ message: '비밀번호가 성공적으로 변경되었습니다.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- Memo Routes (Protected) ---
app.get('/api/memos', authenticateToken, async (req, res) => {
    try {
        const result = await db.memos.listByUserId(req.user.id);
        // Sort by created_at desc
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json(result);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/memos', authenticateToken, async (req, res) => {
    try {
        const newMemo = await db.memos.create({ 
            userId: req.user.id, 
            content: req.body.content 
        });
        res.status(201).json(newMemo);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.put('/api/memos/:id', authenticateToken, async (req, res) => {
    try {
        await db.memos.update(req.params.id, req.user.id, { completed: req.body.completed });
        res.json({ message: 'Memo updated' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.delete('/api/memos/:id', authenticateToken, async (req, res) => {
    try {
        await db.memos.delete(req.params.id, req.user.id);
        res.json({ message: 'Memo deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- Study Session Routes (Protected) ---
app.get('/api/sessions', authenticateToken, async (req, res) => {
    try {
        const result = await db.sessions.listByUserId(req.user.id);
        // Sort by end_time desc
        result.sort((a, b) => new Date(b.end_time) - new Date(a.end_time));
        res.json(result);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/sessions', authenticateToken, async (req, res) => {
    try {
        const { duration, treePlanted, startTime } = req.body;
        await db.sessions.create({ 
            userId: req.user.id, 
            duration, 
            treePlanted, 
            startTime 
        });
        res.status(201).json({ message: 'Session recorded' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- Admin Routes (Protected + Admin Check) ---
app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
    try {
        const users = await db.users.listAll();
        users.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        // Remove password for security
        const safeUsers = users.map(u => ({
            id: u.id,
            username: u.username,
            email: u.email,
            role: u.role,
            created_at: u.created_at
        }));
        res.json(safeUsers);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.put('/api/admin/users/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { username, email } = req.body;
        const updatedUser = await db.users.update(req.params.id, { username, email });
        res.json({
            id: updatedUser.id,
            username: updatedUser.username,
            email: updatedUser.email,
            role: updatedUser.role
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.get('/api/admin/logs', authenticateToken, isAdmin, async (req, res) => {
    try {
        const logs = await db.logs.listAll();
        const users = await db.users.listAll();
        const userMap = {};
        users.forEach(u => { userMap[u.id] = u; });
        
        const logsWithUser = logs.map(l => ({
            ...l,
            userId: userMap[l.user_id] ? { id: l.user_id, username: userMap[l.user_id].username, email: userMap[l.user_id].email } : null
        }));
        
        logsWithUser.sort((a, b) => new Date(b.login_time) - new Date(a.login_time));
        res.json(logsWithUser);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/admin/stats', authenticateToken, isAdmin, async (req, res) => {
    try {
        const users = await db.users.listAll();
        const sessions = await db.sessions.listAll();
        
        const totalUsers = users.length;
        let totalStudyMinutes = 0;
        let totalTreesPlanted = 0;
        
        sessions.forEach(s => {
            totalStudyMinutes += Number(s.duration || 0);
        });
        totalTreesPlanted = Math.floor(totalStudyMinutes / 60);
        
        res.json({
            totalUsers,
            totalStudyMinutes,
            totalTreesPlanted
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Extra routes for Admin Dashboard Detail Views
app.get('/api/admin/sessions', authenticateToken, isAdmin, async (req, res) => {
    try {
        const sessions = await db.sessions.listAll();
        const users = await db.users.listAll();
        const userMap = {};
        users.forEach(u => { userMap[u.id] = u; });
        
        const sessionsWithUser = sessions.map(s => ({
            ...s,
            userId: userMap[s.user_id] ? { id: s.user_id, username: userMap[s.user_id].username, email: userMap[s.user_id].email } : null
        }));
        
        sessionsWithUser.sort((a, b) => new Date(b.end_time) - new Date(a.end_time));
        res.json(sessionsWithUser);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get('/api/admin/memos', authenticateToken, isAdmin, async (req, res) => {
    try {
        const memos = await db.memos.listAll();
        const users = await db.users.listAll();
        const userMap = {};
        users.forEach(u => { userMap[u.id] = u; });
        
        const memosWithUser = memos.map(m => ({
            ...m,
            userId: userMap[m.user_id] ? { id: m.user_id, username: userMap[m.user_id].username, email: userMap[m.user_id].email } : null
        }));
        
        memosWithUser.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json(memosWithUser);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    try {
        await db.sessions.migrateTreeToDuration();
    } catch (e) {
        console.error('Database migration failed:', e);
    }
});
