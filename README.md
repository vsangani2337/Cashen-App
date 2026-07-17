# 💸 Cashen
<em>A smart budget management system to track expenses, control spending, and make better financial decisions — simple, fast, and effective.</em>

---

## 📚 Project Overview

**Cashen** is a full-stack web application built to simplify personal finance management. It replaces traditional manual tracking with an intuitive digital platform that helps users monitor expenses, manage budgets, and gain insights into their spending habits.

It acts as a **personal finance assistant** for:
- 🧑 Individuals managing daily expenses
- 👨‍👩‍👧 Families planning monthly budgets
- 💼 Professionals tracking income and spending

> “Our goal was to empower users with clear financial insights and reduce unnecessary spending through smart tracking.”

---

## 🛠️ Features

### 👤 User Features
- 📊 Interactive dashboard with expense summary
- 💸 Add, update, and delete expenses easily
- 🗂️ Smart categorization (Food, Travel, Bills, etc.)
- 🎯 Monthly & yearly budget setting
- 📈 Visual analytics using charts
- ⚠️ Budget alerts and warnings

### ⚙️ System Features
- 🔐 Secure authentication system
- 📱 Fully responsive design
- 🌐 Cross-browser compatibility
- ⚡ Fast REST API backend

---

## 🧾 Folder Structure

```
CASHEN/
├── cashen-backend/
│   ├── node_modules/
│   ├── .env
│   ├── db.js
│   ├── package.json
│   └── server.js
│
├── cashen-frontend/
│   ├── app.js
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── style.css
│   └── logo.png
│
└── README.md
```

---

## 🚀 Getting Started

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/ChetanSenta/Cashen.git
cd Cashen
```

---

### 2️⃣ Setup Database

```sql
CREATE DATABASE cashen_db;
```

---

### 3️⃣ Backend Setup

```bash
cd cashen-backend
npm install
npm start
```

Server runs on:
```
http://localhost:5001
```

---

### 4️⃣ Frontend Setup

- Open `cashen-frontend` folder  
- Run `index.html` or `login.html` in browser  
- (Recommended: Use VS Code Live Server)

---

## 🔍 API Highlights

Some important endpoints:

- 📥 GET /api/expenses → Fetch all expenses  
- ➕ POST /api/expenses → Add new expense  
- ✏️ PUT /api/expenses/:id → Update expense  
- ❌ DELETE /api/expenses/:id → Delete expense  
- 📊 GET /api/budget → Get budget summary  

---

## 🧠 Learning & Challenges

> “Building Cashen helped us understand full-stack development, API design, and real-world problem solving.”

During this project, we:

- Learned backend development with Node.js & Express  
- Worked with PostgreSQL for structured data handling  
- Built responsive UI using HTML, CSS, JS  
- Integrated charts for data visualization  
- Improved debugging and project structuring skills  

---

## 🚀 Future Enhancements

- 📄 Export reports (PDF/CSV)  
- 🧾 Receipt scanning (OCR)  
- 🤖 AI-based expense prediction  
- 🌙 Dark mode UI  
- 📱 Mobile app version  

---

## 👨‍🎓 Team 

| Name            | ID        |
| --------------- | --------- |
| Abhishek Pitroda  | 202201231 |
| Manthan Rangpariya | 202201227 |
| Vivek Sangani    | 202201200 |
| Chetan Senta     | 202201218 |

* **Course**: Software Group Project - I
* **Institute**: CSPIT
* **Guide**: Dr. Mrugendra Rahevar

---

## 📜 License

This project is developed for academic purposes and is intended for learning and demonstration.

---

<i>“Track smart. Spend smarter.” 💡</i>
