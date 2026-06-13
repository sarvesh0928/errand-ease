const express = require('express');
const sql = require('mssql');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { Connection, Request } = require('tedious');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// SQL Server config
const dbConfig = {
    server: 'LAPTOP-351ASENR',
    database: 'ErrandEase',
    user: 'node_user',
    password: 'NodePass123',
    port: 1433,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

// Test database connection with mssql
app.get('/api/test', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        res.json({ message: 'Database connected successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Test connection with tedious - Option 1 (with port)
app.get('/api/test2', async (req, res) => {
    const config = {
        server: 'LAPTOP-351ASENR',
        authentication: {
            type: 'default',
            options: {
                userName: 'node_user',
                password: 'NodePass123'
            }
        },
        options: {
            database: 'ErrandEase',
            port: 1433,
            trustServerCertificate: true,
            encrypt: false
        }
    };
    
    const connection = new Connection(config);
    
    connection.on('connect', (err) => {
        if (err) {
            res.json({ error: err.message });
        } else {
            res.json({ message: 'Connected successfully with tedious (Option 1 - port)!' });
        }
        connection.close();
    });
    
    connection.connect();
});

// Test connection with tedious - Option 2 (server with port in server string)
app.get('/api/test3', async (req, res) => {
    const config = {
        server: 'LAPTOP-351ASENR,1433',
        authentication: {
            type: 'default',
            options: {
                userName: 'node_user',
                password: 'NodePass123'
            }
        },
        options: {
            database: 'ErrandEase',
            trustServerCertificate: true,
            encrypt: false
        }
    };
    
    const connection = new Connection(config);
    
    connection.on('connect', (err) => {
        if (err) {
            res.json({ error: err.message });
        } else {
            res.json({ message: 'Connected successfully with tedious (Option 2 - server,port)!' });
        }
        connection.close();
    });
    
    connection.connect();
});

// ============ USER ENDPOINTS ============

// Get all users
app.get('/api/users', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query(`
            SELECT UserId, Username, FullName, Role, IsApproved, CreatedAt 
            FROM Users 
            WHERE Role != 'admin'
            ORDER BY CreatedAt DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single user by ID
app.get('/api/users/:userId', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`
            SELECT UserId, Username, FullName, Role, IsApproved, CreatedAt 
            FROM Users 
            WHERE UserId = ${req.params.userId}
        `;
        res.json(result.recordset[0] || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create a new user (for demo data)
app.post('/api/users', async (req, res) => {
    const { username, email, password, fullName, role, isApproved } = req.body;
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await sql.connect(dbConfig);
        
        await sql.query`
            INSERT INTO Users (Username, Email, PasswordHash, FullName, Role, IsApproved)
            VALUES (${username}, ${email}, ${hashedPassword}, ${fullName}, ${role}, ${isApproved ? 1 : 0})
        `;
        
        res.json({ message: 'User created successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Signup endpoint
app.post('/api/signup', async (req, res) => {
    const { username, email, password, fullName, role, idProofUrl } = req.body;
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await sql.connect(dbConfig);
        
        const result = await sql.query`
            INSERT INTO Users (Username, Email, PasswordHash, FullName, Role, IsApproved, IdProofUrl)
            VALUES (${username}, ${email}, ${hashedPassword}, ${fullName}, ${role}, ${role === 'user' ? 1 : 0}, ${idProofUrl || null})
        `;
        
        res.json({ message: 'User created successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`
            SELECT * FROM Users WHERE Username = ${username}
        `;
        
        if (result.recordset.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        const user = result.recordset[0];
        const validPassword = await bcrypt.compare(password, user.PasswordHash);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const token = jwt.sign(
            { userId: user.UserId, username: user.Username, role: user.Role },
            'errandease_secret_key_2025',
            { expiresIn: '24h' }
        );
        
        res.json({
            token,
            user: {
                userId: user.UserId,
                username: user.Username,
                fullName: user.FullName,
                role: user.Role,
                isApproved: user.IsApproved
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ ERRAND ENDPOINTS ============

// Get all errands
app.get('/api/errands', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query(`
            SELECT e.*, 
                   u.FullName as UserName, u.Username as UserUsername,
                   r.FullName as RunnerName
            FROM Errands e
            LEFT JOIN Users u ON e.UserId = u.UserId
            LEFT JOIN Users r ON e.RunnerId = r.UserId
            ORDER BY e.CreatedAt DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get errands by user ID
app.get('/api/errands/user/:userId', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`
            SELECT e.*, 
                   u.FullName as UserName,
                   r.FullName as RunnerName
            FROM Errands e
            LEFT JOIN Users u ON e.UserId = u.UserId
            LEFT JOIN Users r ON e.RunnerId = r.UserId
            WHERE e.UserId = ${req.params.userId}
            ORDER BY e.CreatedAt DESC
        `;
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get errands by runner ID (active + completed)
app.get('/api/errands/runner/:runnerId', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`
            SELECT e.*, 
                   u.FullName as UserName, u.Username as UserUsername
            FROM Errands e
            LEFT JOIN Users u ON e.UserId = u.UserId
            WHERE e.RunnerId = ${req.params.runnerId}
            ORDER BY e.CreatedAt DESC
        `;
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get available errands (pending, no runner assigned)
app.get('/api/errands/available', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query(`
            SELECT e.*, u.FullName as UserName, u.Username as UserUsername
            FROM Errands e
            LEFT JOIN Users u ON e.UserId = u.UserId
            WHERE e.Status = 'pending' AND e.RunnerId IS NULL
            ORDER BY e.DateTime ASC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create new errand
app.post('/api/errands', async (req, res) => {
    const { userId, type, description, address, dateTime, cashAmount } = req.body;
    
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`
            INSERT INTO Errands (UserId, Type, Description, Address, DateTime, CashAmount, Status)
            VALUES (${userId}, ${type}, ${description}, ${address}, ${dateTime}, ${cashAmount}, 'pending')
        `;
        res.json({ message: 'Errand created successfully', errandId: result.recordset });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Accept an errand
app.put('/api/errands/:errandId/accept', async (req, res) => {
    const { runnerId } = req.body;
    const errandId = req.params.errandId;
    
    try {
        await sql.connect(dbConfig);
        await sql.query`
            UPDATE Errands 
            SET Status = 'accepted', RunnerId = ${runnerId}, AcceptedAt = GETDATE()
            WHERE ErrandId = ${errandId} AND Status = 'pending'
        `;
        res.json({ message: 'Errand accepted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Complete an errand
app.put('/api/errands/:errandId/complete', async (req, res) => {
    const errandId = req.params.errandId;
    
    try {
        await sql.connect(dbConfig);
        await sql.query`
            UPDATE Errands 
            SET Status = 'completed', CompletedAt = GETDATE()
            WHERE ErrandId = ${errandId} AND Status = 'accepted'
        `;
        res.json({ message: 'Errand completed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete an errand (admin only)
app.delete('/api/errands/:errandId', async (req, res) => {
    const errandId = req.params.errandId;
    
    try {
        await sql.connect(dbConfig);
        await sql.query`DELETE FROM Errands WHERE ErrandId = ${errandId}`;
        res.json({ message: 'Errand deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Approve runner
app.put('/api/users/:userId/approve', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        await sql.query`
            UPDATE Users 
            SET IsApproved = 1 
            WHERE UserId = ${req.params.userId} AND Role = 'runner'
        `;
        res.json({ message: 'Runner approved successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete user (admin only)
app.delete('/api/users/:userId', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        
        // Delete user's errands first
        await sql.query`DELETE FROM Errands WHERE UserId = ${req.params.userId}`;
        await sql.query`DELETE FROM Errands WHERE RunnerId = ${req.params.userId}`;
        
        // Delete user
        await sql.query`DELETE FROM Users WHERE UserId = ${req.params.userId}`;
        
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ============ FILE UPLOAD FOR PROOF OF DELIVERY ============
const fs = require('fs');
const path = require('path');

// Create uploads folder if not exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

app.use('/uploads', express.static('public/uploads'));

// Upload proof of delivery image
app.post('/api/errands/:errandId/upload-proof', async (req, res) => {
    const errandId = req.params.errandId;
    const { imageData } = req.body; // base64 image data
    
    if (!imageData) {
        return res.status(400).json({ error: 'No image provided' });
    }
    
    try {
        // Remove base64 prefix if present
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const filename = `proof_${errandId}_${Date.now()}.png`;
        const filepath = path.join(uploadDir, filename);
        
        fs.writeFileSync(filepath, base64Data, 'base64');
        
        await sql.connect(dbConfig);
        await sql.query`
            UPDATE Errands 
            SET ProofOfDelivery = ${'/uploads/' + filename}
            WHERE ErrandId = ${errandId}
        `;
        
        res.json({ message: 'Proof uploaded successfully', imageUrl: `/uploads/${filename}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Add rating for completed errand
app.post('/api/ratings', async (req, res) => {
    const { errandId, userId, runnerId, rating, review } = req.body;
    
    try {
        await sql.connect(dbConfig);
        await sql.query`
            INSERT INTO Ratings (ErrandId, UserId, RunnerId, Rating, Review)
            VALUES (${errandId}, ${userId}, ${runnerId}, ${rating}, ${review})
        `;
        
        // Update runner's average rating
        const result = await sql.query`
            SELECT AVG(CAST(Rating AS FLOAT)) as AvgRating FROM Ratings WHERE RunnerId = ${runnerId}
        `;
        const avgRating = result.recordset[0].AvgRating || 0;
        
        await sql.query`
            UPDATE Users SET Rating = ${avgRating} WHERE UserId = ${runnerId}
        `;
        
        res.json({ message: 'Rating submitted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get ratings for a runner
app.get('/api/ratings/runner/:runnerId', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`
            SELECT r.*, u.FullName as UserName 
            FROM Ratings r
            JOIN Users u ON r.UserId = u.UserId
            WHERE r.RunnerId = ${req.params.runnerId}
            ORDER BY r.CreatedAt DESC
        `;
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Send message
app.post('/api/chat/send', async (req, res) => {
    const { errandId, senderId, receiverId, message } = req.body;
    try {
        await sql.connect(dbConfig);
        await sql.query`
            INSERT INTO ChatMessages (ErrandId, SenderId, ReceiverId, Message)
            VALUES (${errandId}, ${senderId}, ${receiverId}, ${message})
        `;
        res.json({ message: 'Message sent' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get messages
app.get('/api/chat/:errandId/:userId', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`
            SELECT * FROM ChatMessages 
            WHERE ErrandId = ${req.params.errandId} 
            AND (SenderId = ${req.params.userId} OR ReceiverId = ${req.params.userId})
            ORDER BY CreatedAt ASC
        `;
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Start server
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});