const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');

// Load configuration
const config = require('./config/config');

// Initialize Express
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'temporary-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Directory setup middleware
async function setupDirectories(req, res, next) {
    try {
        // Create required directories
        await fs.mkdir(config.ISSUE_DIR, { recursive: true });
        await fs.mkdir(path.join(config.ISSUE_DIR, 'answers'), { recursive: true });
        await fs.mkdir(config.STATIC_DIR, { recursive: true });
        next();
    } catch (error) {
        next(error);
    }
}

app.use(setupDirectories);

// Admin authentication middleware
async function loadAdmins() {
    try {
        const adminsFile = path.join(__dirname, 'admins.txt');
        const data = await fs.readFile(adminsFile, 'utf8');
        return data.split('\n')
                   .map(line => line.trim())
                   .filter(Boolean);
    } catch (error) {
        console.error('Error loading admins:', error);
        return [];
    }
}

async function authenticateAdmin(username, password) {
    const admins = await loadAdmins();
    // In production, implement proper password hashing
    return admins.includes(`${username}:${password}`);
}

// Admin authentication routes
app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, config.STATIC_DIR, 'admin-login.html'));
});

app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const isValid = await authenticateAdmin(username, password);
        if (isValid) {
            req.session.isAdmin = true;
            req.session.username = username;
            res.json({ success: true });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// Admin logout
app.get('/admin/logout', (req, res) => {
    req.session.destroy(error => {
        if (error) {
            res.status(500).json({ error: 'Logout failed' });
        } else {
            res.json({ success: true });
        }
    });
});

// Admin protection middleware
function requireAdmin(req, res, next) {
    if (!req.session?.isAdmin) {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
}

// Admin dashboard
app.get('/admin/dashboard', requireAdmin, async (req, res) => {
    try {
        const pendingIssues = await fs.readdir(config.ISSUE_DIR)
            .then(files => files.filter(f => !f.includes('.answer')));
        res.json({ issues: pendingIssues });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load issues' });
    }
});

// Answer submission route
app.post('/admin/answer/:issueId', requireAdmin, async (req, res) => {
    const { issueId } = req.params;
    const { answer } = req.body;

    try {
        const issuePath = path.join(config.ISSUE_DIR, `${issueId}.txt`);
        const answerPath = path.join(config.ISSUE_DIR, 'answers', `${issueId}.answer.txt`);

        // Read original issue
        const issueContent = await fs.readFile(issuePath, 'utf8');
        
        // Write answer
        await fs.writeFile(answerPath, JSON.stringify({
            answer,
            respondedBy: req.session.username,
            timestamp: new Date().toISOString()
        }, null, 2));

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save answer' });
    }
});

// Issue submission route
app.post('/api/report-issue', async (req, res) => {
    const { githubUsername, description } = req.body;
    
    // Validate inputs
    if (!githubUsername || !description) {
        return res.status(400).json({ error: 'Both username and description are required' });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(5).toString('hex');
    const filename = `${githubUsername}-${timestamp}-${randomSuffix}.txt`;

    try {
        await fs.writeFile(
            path.join(config.ISSUE_DIR, filename),
            JSON.stringify({
                githubUsername,
                description,
                timestamp,
                status: 'pending'
            }, null, 2)
        );

        res.json({ success: true, filename });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save issue' });
    }
});

// Serve frontend files
app.use(express.static(config.STATIC_DIR));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || config.PORT;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});