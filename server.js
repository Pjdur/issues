const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Configuration
const ISSUE_DIR = './issues';
const ANSWER_DIR = './answers';

// Middleware to ensure directories exist
async function setupDirectories(req, res, next) {
    try {
        await fs.mkdir(ISSUE_DIR, { recursive: true });
        await fs.mkdir(path.join(ISSUE_DIR, 'answers'), { recursive: true });
        next();
    } catch (error) {
        next(error);
    }
}

app.use(setupDirectories);

// Handle issue submission
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
            path.join(ISSUE_DIR, filename),
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
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});