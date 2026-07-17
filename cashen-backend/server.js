const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { exec } = require('child_process');

require('dotenv').config();
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../cashen-frontend')));

/* =========================================
   1. MIDDLEWARE: AUTHENTICATION CHECK
   ========================================= */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json("Access Denied");

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json("Invalid Token");
        req.user = user;
        next();
    });
};

/* =========================================
   2. AUTHENTICATION ROUTES
   ========================================= */
app.post('/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.query(
            "INSERT INTO users (name, email, password) VALUES ($1, $2, $3)",
            [name, email, hashedPassword]
        );
        res.status(201).json({ message: "User created successfully" });
    } catch (err) {
        console.error(err.message);
        res.status(400).json("Server Error: " + err.message);
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

        if (result.rows.length === 0) return res.status(401).json("User not found");

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json("Incorrect Password");

        // Token must contain email to fetch data later
        const token = jwt.sign({ email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { name: user.name, email: user.email } });
    } catch (err) {
        console.error(err.message);
        res.status(500).json("Server Error");
    }
});

app.delete('/auth/delete-account', authenticateToken, async (req, res) => {
    try {
        await pool.query("DELETE FROM users WHERE email = $1", [req.user.email]);
        res.json({ message: "Account deleted successfully" });
    } catch (err) {
        res.status(500).json("Server Error");
    }
});

app.put('/auth/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await pool.query("SELECT * FROM users WHERE email = $1", [req.user.email]);

        if (result.rows.length === 0) return res.status(404).json("User not found");

        const validPassword = await bcrypt.compare(currentPassword, result.rows[0].password);
        if (!validPassword) return res.status(401).json("Current password is incorrect");

        if (newPassword.length < 6) return res.status(400).json("Password must be at least 6 characters");

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query("UPDATE users SET password = $1 WHERE email = $2", [hashedPassword, req.user.email]);

        res.json({ message: "Password updated successfully" });
    } catch (err) {
        res.status(500).json("Server Error");
    }
});

/* =========================================
   3. DATA RETRIEVAL (DASHBOARD)
   ========================================= */
app.get('/dashboard-data', authenticateToken, async (req, res) => {
    try {
        const email = req.user.email; // Extracted from verified token

        // All queries use user_email to match your database structure
        const transactions = await pool.query("SELECT * FROM transactions WHERE user_email = $1 ORDER BY date DESC", [email]);
        const budgets = await pool.query("SELECT * FROM budgets WHERE user_email = $1", [email]);
        const loans = await pool.query("SELECT * FROM loans WHERE user_email = $1", [email]);
        const goals = await pool.query("SELECT * FROM goals WHERE user_email = $1", [email]);

        const budgetObj = {};
        budgets.rows.forEach(b => budgetObj[b.category] = Number(b.limit_amount));

        res.json({
            transactions: transactions.rows,
            budgets: budgetObj,
            loans: loans.rows,
            goals: goals.rows
        });
    } catch (err) {
        console.error("Dashboard Error:", err.message);
        res.status(500).json("Server Error");
    }
});

/* =========================================
   4. TRANSACTION ROUTES
   ========================================= */
app.post('/transactions', authenticateToken, async (req, res) => {
    try {
        const { description, amount, type, category, date } = req.body;
        const newTx = await pool.query(
            "INSERT INTO transactions (user_email, description, amount, type, category, date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
            [req.user.email, description, amount, type, category, date]
        );
        res.json(newTx.rows[0]);
    } catch (err) { res.status(500).json("Server Error"); }
});

app.delete('/transactions/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query("DELETE FROM transactions WHERE id = $1 AND user_email = $2", [req.params.id, req.user.email]);
        res.json({ message: "Transaction deleted" });
    } catch (err) { res.status(500).json("Server Error"); }
});

/* =========================================
   5. BUDGET ROUTES
   ========================================= */
app.post('/budgets', authenticateToken, async (req, res) => {
    try {
        const { category, limit_amount } = req.body;
        await pool.query("DELETE FROM budgets WHERE user_email = $1 AND category = $2", [req.user.email, category]);
        const newBudget = await pool.query(
            "INSERT INTO budgets (user_email, category, limit_amount) VALUES ($1, $2, $3) RETURNING *",
            [req.user.email, category, limit_amount]
        );
        res.json(newBudget.rows[0]);
    } catch (err) { res.status(500).json("Server Error"); }
});

app.delete('/budgets', authenticateToken, async (req, res) => {
    try {
        const { category } = req.body;
        await pool.query("DELETE FROM budgets WHERE user_email = $1 AND category = $2", [req.user.email, category]);
        res.json({ message: "Budget deleted" });
    } catch (err) { res.status(500).json("Server Error"); }
});

/* =========================================
   6. LOAN ROUTES
   ========================================= */
app.post('/loans', authenticateToken, async (req, res) => {
    try {
        const { name, type, amount } = req.body;
        const newLoan = await pool.query(
            "INSERT INTO loans (user_email, name, type, amount) VALUES ($1, $2, $3, $4) RETURNING *",
            [req.user.email, name, type, amount]
        );
        res.json(newLoan.rows[0]);
    } catch (err) { res.status(500).json("Server Error"); }
});

app.delete('/loans/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query("DELETE FROM loans WHERE id = $1 AND user_email = $2", [req.params.id, req.user.email]);
        res.json({ message: "Loan deleted" });
    } catch (err) { res.status(500).json("Server Error"); }
});

app.put('/loans/:id', authenticateToken, async (req, res) => {
    try {
        const { amount } = req.body;
        const updated = await pool.query(
            "UPDATE loans SET amount = $1 WHERE id = $2 AND user_email = $3 RETURNING *",
            [amount, req.params.id, req.user.email]
        );
        res.json(updated.rows[0]);
    } catch (err) { res.status(500).json("Server Error"); }
});

/* =========================================
   7. GOAL ROUTES
   ========================================= */
app.post('/goals', authenticateToken, async (req, res) => {
    try {
        const { name, target_amount } = req.body;
        const newGoal = await pool.query(
            "INSERT INTO goals (user_email, name, target_amount, saved_amount) VALUES ($1, $2, $3, 0) RETURNING *",
            [req.user.email, name, target_amount]
        );
        res.json(newGoal.rows[0]);
    } catch (err) { res.status(500).json("Server Error"); }
});

app.delete('/goals/:id', authenticateToken, async (req, res) => {
    try {
        await pool.query("DELETE FROM goals WHERE id = $1 AND user_email = $2", [req.params.id, req.user.email]);
        res.json({ message: "Goal deleted" });
    } catch (err) { res.status(500).json("Server Error"); }
});

app.put('/goals/:id', authenticateToken, async (req, res) => {
    try {
        const { saved_amount } = req.body;
        const updated = await pool.query(
            "UPDATE goals SET saved_amount = $1 WHERE id = $2 AND user_email = $3 RETURNING *",
            [saved_amount, req.params.id, req.user.email]
        );
        res.json(updated.rows[0]);
    } catch (err) { res.status(500).json("Server Error"); }
});

/* =========================================
   START SERVER
========================================= */
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
    console.log(`🚀 Server running at: http://localhost:${PORT}`);
    console.log(`✅ Backend is active. Please open your browser manually.`);
});

// This will catch any hidden errors that try to kill your server
server.on('error', (err) => {
    console.error('❌ Server Crash Error:', err);
});